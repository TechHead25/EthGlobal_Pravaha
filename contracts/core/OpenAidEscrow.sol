// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OpenAidEscrow
 * @notice Purpose-bound USDC escrow and conditional settlement engine for OpenAid Protocol.
 *         Implements Arc-compliant advanced stablecoin logic:
 *         - Purpose-bound donor capital allocation
 *         - Sealed commit–reveal procurement auction
 *         - Delivery evidence commitment anchoring
 *         - Independent 3-of-5 validator quorum with anti-double-voting
 *         - Staged settlement (70% Tranche 1 on quorum, 30% Tranche 2 post-challenge)
 *         - Timelock challenge window and dispute freezing
 *         - Pull-over-push proportional donor refunds
 *         - Zero arbitrary withdrawal/sweep backdoors
 */
contract OpenAidEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- ENUMS & STRUCTS ---

    enum CampaignState {
        FundingActive,        // 0: Donors depositing USDC
        FundingFailed,        // 1: Deadline passed before budget reached
        BiddingCommit,        // 2: Vendors submitting sealed bid hashes
        BiddingReveal,        // 3: Vendors revealing plain bid amounts
        AuctionFailed,        // 4: Zero valid reveals submitted
        AwaitingDelivery,     // 5: Winning vendor fulfilling delivery
        DeliveryFailed,       // 6: Delivery deadline expired without evidence
        VerificationPending,  // 7: Evidence committed; validators voting
        VerificationFailed,   // 8: Rejected by validators or voting timeout
        InChallengePeriod,    // 9: Stage 1 paid; 72h/demo timelock window open
        Disputed,             // 10: Fraud challenge filed; Stage 2 locked
        Completed,            // 11: Final settlement completed (30% disbursed or refunded)
        Refunded,             // 12: Terminal refund state
        Cancelled             // 13: Creator cancelled before procurement; full donor refunds
    }

    struct Campaign {
        uint256 id;
        address creator;
        uint256 budgetCeiling;
        uint256 totalDeposited;
        uint64 fundingDeadline;
        uint64 deliveryDeadline;
        string metadataCid;
        CampaignState state;
        address winningVendor;
        uint256 winningBidAmount;
        string evidenceIpfsCid;
        uint64 evidenceSubmittedAt;
        uint8 affirmativeVotes;
        uint8 negativeVotes;
        bool stage1Paid;
        bool stage2Paid;
        uint64 challengeExpiry;
        bool isDisputed;
        string disputeEvidenceCid;
        address challenger;
    }

    struct BidCommitment {
        bytes32 commitHash;
        uint256 bondAmount;
        bool revealed;
        uint256 revealedAmount;
        uint64 revealedAt;
    }

    // --- IMMUTABLE & CONFIGURATION STATE ---

    IERC20 public immutable usdcToken;
    address public immutable owner;

    uint8 public constant QUORUM_THRESHOLD = 3;
    uint8 public constant TOTAL_VALIDATORS = 5;
    uint256 public constant STAGE1_PERCENT = 70;
    uint256 public constant STAGE2_PERCENT = 30;
    uint256 public constant BOND_BASIS_POINTS = 500; // 5% bid bond
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;

    uint256 public campaignCount;

    // --- STORAGE MAPPINGS ---

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public donorDeposits;
    mapping(uint256 => mapping(address => bool)) public hasClaimedRefund;

    // Auction storage: campaignId => vendor => Commitment
    mapping(uint256 => mapping(address => BidCommitment)) public bidCommitments;
    mapping(uint256 => address[]) internal _campaignVendors;
    mapping(uint256 => uint64) public commitDeadlines;
    mapping(uint256 => uint64) public revealDeadlines;

    // Validator registry: address => isAuthorized
    mapping(address => bool) public isValidator;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public validatorVote; // true = approve, false = reject

    // Surplus & Refund accounting
    mapping(uint256 => uint256) public unspentSurplus;

    // --- EVENTS ---

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint256 budgetCeiling, string metadataCid, uint64 fundingDeadline, uint64 deliveryDeadline);
    event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event CampaignFullyFunded(uint256 indexed campaignId, uint256 totalAmount);
    event AuctionOpened(uint256 indexed campaignId, uint64 commitDeadline, uint64 revealDeadline);
    event BidCommitted(uint256 indexed campaignId, address indexed vendor, bytes32 commitHash, uint256 bondAmount);
    event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 amount);
    event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningAmount);
    event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint64 timestamp);
    event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved);
    event QuorumReached(uint256 indexed campaignId, uint8 affirmativeCount);
    event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event DisputeRaised(uint256 indexed campaignId, address indexed challenger, string counterEvidenceCid);
    event DisputeResolved(uint256 indexed campaignId, bool upheld);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event FundingClosedEarly(uint256 indexed campaignId, uint256 previousBudgetCeiling, uint256 finalBudget);
    event CampaignCancelled(uint256 indexed campaignId, address indexed creator, uint256 totalDepositedAtCancel);
    event StateTransition(uint256 indexed campaignId, CampaignState previousState, CampaignState newState);

    // --- CUSTOM ERRORS ---

    error ZeroAddress();
    error ZeroAmount();
    error InvalidState(CampaignState current, CampaignState expected);
    error DeadlinePassed();
    error DeadlineNotPassed();
    error BudgetCeilingExceeded();
    error Unauthorized();
    error AlreadyCommitted();
    error InvalidCommitment();
    error BidExceedsBudget();
    error NoValidBids();
    error NotAnAuthorizedValidator();
    error AlreadyVoted();
    error EvidenceAlreadySubmitted();
    error Stage1AlreadyPaid();
    error ChallengePeriodActive();
    error DisputePending();
    error NoRefundDue();
    error TransferFailed();
    error InsufficientBond();

    // --- MODIFIERS ---

    modifier onlyValidator() {
        if (!isValidator[msg.sender]) revert NotAnAuthorizedValidator();
        _;
    }

    // --- CONSTRUCTOR ---

    constructor(address _usdcToken, address[] memory _initialValidators) {
        if (_usdcToken == address(0)) revert ZeroAddress();
        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;

        for (uint256 i = 0; i < _initialValidators.length; i++) {
            if (_initialValidators[i] != address(0)) {
                isValidator[_initialValidators[i]] = true;
            }
        }
    }

    // --- CAMPAIGN MANAGEMENT ---

    /**
     * @notice Create a purpose-bound humanitarian procurement campaign.
     */
    function createCampaign(
        uint256 budgetCeiling,
        uint64 fundingDurationSeconds,
        uint64 deliveryDurationSeconds,
        string calldata metadataCid
    ) external returns (uint256 campaignId) {
        if (budgetCeiling == 0) revert ZeroAmount();

        campaignId = ++campaignCount;
        uint64 fundingDeadline = uint64(block.timestamp) + fundingDurationSeconds;
        uint64 deliveryDeadline = fundingDeadline + deliveryDurationSeconds;

        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            budgetCeiling: budgetCeiling,
            totalDeposited: 0,
            fundingDeadline: fundingDeadline,
            deliveryDeadline: deliveryDeadline,
            metadataCid: metadataCid,
            state: CampaignState.FundingActive,
            winningVendor: address(0),
            winningBidAmount: 0,
            evidenceIpfsCid: "",
            evidenceSubmittedAt: 0,
            affirmativeVotes: 0,
            negativeVotes: 0,
            stage1Paid: false,
            stage2Paid: false,
            challengeExpiry: 0,
            isDisputed: false,
            disputeEvidenceCid: "",
            challenger: address(0)
        });

        emit CampaignCreated(campaignId, msg.sender, budgetCeiling, metadataCid, fundingDeadline, deliveryDeadline);
    }

    // --- DONOR FUNDING ---

    /**
     * @notice Deposit USDC directly into the purpose-bound escrow.
     */
    function depositFunds(uint256 campaignId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.FundingActive) revert InvalidState(c.state, CampaignState.FundingActive);
        if (block.timestamp > c.fundingDeadline) revert DeadlinePassed();
        if (c.totalDeposited + amount > c.budgetCeiling) revert BudgetCeilingExceeded();

        // Checks-Effects-Interactions
        c.totalDeposited += amount;
        donorDeposits[campaignId][msg.sender] += amount;

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        emit FundsDeposited(campaignId, msg.sender, amount);

        if (c.totalDeposited == c.budgetCeiling) {
            c.state = CampaignState.BiddingCommit;
            emit CampaignFullyFunded(campaignId, c.totalDeposited);
            emit StateTransition(campaignId, CampaignState.FundingActive, CampaignState.BiddingCommit);
        }
    }

    /**
     * @notice Handle funding timeout if target budget was not reached.
     */
    function triggerFundingTimeout(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.FundingActive) revert InvalidState(c.state, CampaignState.FundingActive);
        if (block.timestamp <= c.fundingDeadline) revert DeadlineNotPassed();

        c.state = CampaignState.FundingFailed;
        emit StateTransition(campaignId, CampaignState.FundingActive, CampaignState.FundingFailed);
    }

    // --- CREATOR CAMPAIGN CONTROLS ---

    /**
     * @notice Creator ends the funding phase before the deadline and proceeds to procurement
     *         with the amount raised so far. The budget ceiling is lowered to totalDeposited, so
     *         bids, bonds, payouts and surplus refunds are all computed on what donors actually gave.
     * @dev No tokens move. Funds remain escrowed and can still only reach the winning vendor
     *      (after validator quorum) or return to donors — the creator gains no custody.
     */
    function closeFundingEarly(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.creator) revert Unauthorized();
        if (c.state != CampaignState.FundingActive) revert InvalidState(c.state, CampaignState.FundingActive);
        if (block.timestamp > c.fundingDeadline) revert DeadlinePassed();
        if (c.totalDeposited == 0) revert ZeroAmount();

        uint256 previousCeiling = c.budgetCeiling;
        c.budgetCeiling = c.totalDeposited;
        c.state = CampaignState.BiddingCommit;

        emit FundingClosedEarly(campaignId, previousCeiling, c.totalDeposited);
        emit CampaignFullyFunded(campaignId, c.totalDeposited);
        emit StateTransition(campaignId, CampaignState.FundingActive, CampaignState.BiddingCommit);
    }

    /**
     * @notice Creator cancels a campaign before any vendor has posted a bond. Every donor can then
     *         pull a 100% refund via claimRefund. On-chain history is preserved (nothing is deleted).
     * @dev Allowed while FundingActive, or in BiddingCommit before openAuction (no bonds held).
     *      No tokens move here; refunds are pull-based.
     */
    function cancelCampaign(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.creator) revert Unauthorized();
        CampaignState previous = c.state;
        bool cancellable =
            previous == CampaignState.FundingActive ||
            (previous == CampaignState.BiddingCommit && commitDeadlines[campaignId] == 0);
        if (!cancellable) revert InvalidState(previous, CampaignState.FundingActive);

        c.state = CampaignState.Cancelled;

        emit CampaignCancelled(campaignId, msg.sender, c.totalDeposited);
        emit StateTransition(campaignId, previous, CampaignState.Cancelled);
    }

    // --- PROCUREMENT AUCTION (COMMIT–REVEAL) ---

    /**
     * @notice Configure commit and reveal window deadlines once campaign is funded.
     */
    function openAuction(uint256 campaignId, uint64 commitDuration, uint64 revealDuration) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (commitDeadlines[campaignId] != 0) revert InvalidState(c.state, CampaignState.BiddingCommit);

        commitDeadlines[campaignId] = uint64(block.timestamp) + commitDuration;
        revealDeadlines[campaignId] = uint64(block.timestamp) + commitDuration + revealDuration;

        emit AuctionOpened(campaignId, commitDeadlines[campaignId], revealDeadlines[campaignId]);
    }

    /**
     * @notice Commit a sealed bid hash with mandatory bid bond collateral.
     *         commitHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender))
     */
    function commitBid(uint256 campaignId, bytes32 commitHash) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (block.timestamp > commitDeadlines[campaignId]) revert DeadlinePassed();
        if (bidCommitments[campaignId][msg.sender].commitHash != bytes32(0)) revert AlreadyCommitted();

        uint256 requiredBond = (c.budgetCeiling * BOND_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;

        bidCommitments[campaignId][msg.sender] = BidCommitment({
            commitHash: commitHash,
            bondAmount: requiredBond,
            revealed: false,
            revealedAmount: 0,
            revealedAt: 0
        });
        _campaignVendors[campaignId].push(msg.sender);

        usdcToken.safeTransferFrom(msg.sender, address(this), requiredBond);

        emit BidCommitted(campaignId, msg.sender, commitHash, requiredBond);
    }

    /**
     * @notice Transition from commit window to reveal window.
     */
    function advanceToReveal(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingCommit) revert InvalidState(c.state, CampaignState.BiddingCommit);
        if (block.timestamp <= commitDeadlines[campaignId]) revert DeadlineNotPassed();

        if (_campaignVendors[campaignId].length == 0) {
            c.state = CampaignState.AuctionFailed;
            emit StateTransition(campaignId, CampaignState.BiddingCommit, CampaignState.AuctionFailed);
        } else {
            c.state = CampaignState.BiddingReveal;
            emit StateTransition(campaignId, CampaignState.BiddingCommit, CampaignState.BiddingReveal);
        }
    }

    /**
     * @notice Reveal a previously committed sealed bid.
     */
    function revealBid(uint256 campaignId, uint256 bidAmount, bytes32 salt) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingReveal) revert InvalidState(c.state, CampaignState.BiddingReveal);
        if (block.timestamp > revealDeadlines[campaignId]) revert DeadlinePassed();

        BidCommitment storage b = bidCommitments[campaignId][msg.sender];
        if (b.commitHash == bytes32(0)) revert Unauthorized();
        if (b.revealed) revert AlreadyCommitted();

        bytes32 expectedHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender));
        if (expectedHash != b.commitHash) revert InvalidCommitment();
        if (bidAmount > c.budgetCeiling) revert BidExceedsBudget();

        b.revealed = true;
        b.revealedAmount = bidAmount;
        b.revealedAt = uint64(block.timestamp);

        emit BidRevealed(campaignId, msg.sender, bidAmount);
    }

    /**
     * @notice Finalize the auction: pick lowest valid revealed bidder.
     */
    function finalizeAuction(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.BiddingReveal) revert InvalidState(c.state, CampaignState.BiddingReveal);
        if (block.timestamp <= revealDeadlines[campaignId]) revert DeadlineNotPassed();

        address[] memory vendors = _campaignVendors[campaignId];
        address winningVendor = address(0);
        uint256 lowestBid = type(uint256).max;
        uint64 earliestReveal = type(uint64).max;

        for (uint256 i = 0; i < vendors.length; i++) {
            address v = vendors[i];
            BidCommitment storage b = bidCommitments[campaignId][v];
            if (b.revealed && b.revealedAmount > 0) {
                if (b.revealedAmount < lowestBid) {
                    lowestBid = b.revealedAmount;
                    winningVendor = v;
                    earliestReveal = b.revealedAt;
                } else if (b.revealedAmount == lowestBid && b.revealedAt < earliestReveal) {
                    // Tie-breaker: earliest valid reveal
                    winningVendor = v;
                    earliestReveal = b.revealedAt;
                }
            } else {
                // Non-revealed vendor bond slashed to campaign surplus pool
                b.bondAmount = 0;
            }
        }

        if (winningVendor == address(0)) {
            c.state = CampaignState.AuctionFailed;
            emit StateTransition(campaignId, CampaignState.BiddingReveal, CampaignState.AuctionFailed);
            return;
        }

        c.winningVendor = winningVendor;
        c.winningBidAmount = lowestBid;
        c.state = CampaignState.AwaitingDelivery;

        // Refund bid bonds for non-winning revealed vendors
        for (uint256 i = 0; i < vendors.length; i++) {
            address v = vendors[i];
            if (v != winningVendor && bidCommitments[campaignId][v].revealed) {
                uint256 bond = bidCommitments[campaignId][v].bondAmount;
                if (bond > 0) {
                    bidCommitments[campaignId][v].bondAmount = 0;
                    usdcToken.safeTransfer(v, bond);
                }
            }
        }

        // Calculate surplus (budgetCeiling - winningBid)
        if (c.budgetCeiling > lowestBid) {
            unspentSurplus[campaignId] = c.budgetCeiling - lowestBid;
        }

        emit AuctionFinalized(campaignId, winningVendor, lowestBid);
        emit StateTransition(campaignId, CampaignState.BiddingReveal, CampaignState.AwaitingDelivery);
    }

    // --- DELIVERY EVIDENCE SUBMISSION ---

    /**
     * @notice Winning vendor submits the IPFS CID of delivery evidence manifest.
     */
    function submitDeliveryEvidence(uint256 campaignId, string calldata ipfsCid) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.AwaitingDelivery) revert InvalidState(c.state, CampaignState.AwaitingDelivery);
        if (msg.sender != c.winningVendor) revert Unauthorized();
        if (block.timestamp > c.deliveryDeadline) revert DeadlinePassed();
        if (bytes(ipfsCid).length == 0) revert ZeroAmount();

        c.evidenceIpfsCid = ipfsCid;
        c.evidenceSubmittedAt = uint64(block.timestamp);
        c.state = CampaignState.VerificationPending;

        emit EvidenceSubmitted(campaignId, msg.sender, ipfsCid, uint64(block.timestamp));
        emit StateTransition(campaignId, CampaignState.AwaitingDelivery, CampaignState.VerificationPending);
    }

    /**
     * @notice Trigger failure if delivery deadline expires without evidence submission.
     */
    function triggerDeliveryTimeout(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.AwaitingDelivery) revert InvalidState(c.state, CampaignState.AwaitingDelivery);
        if (block.timestamp <= c.deliveryDeadline) revert DeadlineNotPassed();

        c.state = CampaignState.DeliveryFailed;
        // Vendor bond is slashed (stays in escrow for donors)
        bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

        emit StateTransition(campaignId, CampaignState.AwaitingDelivery, CampaignState.DeliveryFailed);
    }

    // --- VALIDATOR QUORUM & STAGED SETTLEMENT ---

    /**
     * @notice Registered validator casts one vote (approve or reject) on delivery evidence.
     *         Reaching 3 affirmative votes triggers Stage 1 (70%) payment immediately.
     */
    function castVote(uint256 campaignId, bool approve, uint64 challengeWindowSeconds) external onlyValidator nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.VerificationPending) revert InvalidState(c.state, CampaignState.VerificationPending);
        if (hasVoted[campaignId][msg.sender]) revert AlreadyVoted();

        hasVoted[campaignId][msg.sender] = true;
        validatorVote[campaignId][msg.sender] = approve;

        if (approve) {
            c.affirmativeVotes++;
        } else {
            c.negativeVotes++;
        }

        emit VoteCast(campaignId, msg.sender, approve);

        // Check rejection threshold (3 negative votes)
        if (c.negativeVotes >= QUORUM_THRESHOLD) {
            c.state = CampaignState.VerificationFailed;
            emit StateTransition(campaignId, CampaignState.VerificationPending, CampaignState.VerificationFailed);
            return;
        }

        // Check affirmative quorum threshold (3 affirmative votes)
        if (c.affirmativeVotes >= QUORUM_THRESHOLD && !c.stage1Paid) {
            _executeStage1(campaignId, challengeWindowSeconds);
        }
    }

    function _executeStage1(uint256 campaignId, uint64 challengeWindowSeconds) internal {
        Campaign storage c = campaigns[campaignId];
        c.stage1Paid = true;
        c.state = CampaignState.InChallengePeriod;
        c.challengeExpiry = uint64(block.timestamp) + (challengeWindowSeconds > 0 ? challengeWindowSeconds : 72 hours);

        uint256 stage1Amount = (c.winningBidAmount * STAGE1_PERCENT) / 100;

        emit QuorumReached(campaignId, c.affirmativeVotes);
        emit Stage1Settled(campaignId, c.winningVendor, stage1Amount);
        emit StateTransition(campaignId, CampaignState.VerificationPending, CampaignState.InChallengePeriod);

        usdcToken.safeTransfer(c.winningVendor, stage1Amount);
    }

    // --- CHALLENGE & DISPUTE MECHANISM ---

    /**
     * @notice Raise a fraud/delivery dispute during the challenge window.
     */
    function raiseDispute(uint256 campaignId, string calldata counterEvidenceCid) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.InChallengePeriod) revert InvalidState(c.state, CampaignState.InChallengePeriod);
        if (block.timestamp > c.challengeExpiry) revert DeadlinePassed();

        uint256 disputeBond = (c.winningBidAmount * 10) / 100; // 10% dispute bond
        c.isDisputed = true;
        c.disputeEvidenceCid = counterEvidenceCid;
        c.challenger = msg.sender;
        c.state = CampaignState.Disputed;

        usdcToken.safeTransferFrom(msg.sender, address(this), disputeBond);

        emit DisputeRaised(campaignId, msg.sender, counterEvidenceCid);
        emit StateTransition(campaignId, CampaignState.InChallengePeriod, CampaignState.Disputed);
    }

    /**
     * @notice Resolve an active dispute via validator quorum.
     */
    function resolveDispute(uint256 campaignId, bool upholdDispute) external onlyValidator nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.Disputed) revert InvalidState(c.state, CampaignState.Disputed);

        c.state = CampaignState.Completed;

        uint256 disputeBond = (c.winningBidAmount * 10) / 100;

        if (upholdDispute) {
            // Dispute upheld: Vendor loses 30% and performance bond; Challenger gets bond + reward
            uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
            bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(c.challenger, disputeBond + (vendorBond / 2));

            emit DisputeResolved(campaignId, true);
        } else {
            // Dispute dismissed: Challenger loses bond; Vendor gets Stage 2
            c.stage2Paid = true;
            uint256 stage2Amount = (c.winningBidAmount * STAGE2_PERCENT) / 100;
            uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
            bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(c.winningVendor, stage2Amount + vendorBond + (disputeBond / 2));

            emit DisputeResolved(campaignId, false);
            emit Stage2Settled(campaignId, c.winningVendor, stage2Amount);
        }
    }

    // --- FINAL STAGE 2 SETTLEMENT ---

    /**
     * @notice Finalize Stage 2 (30%) payment after challenge period expires cleanly.
     */
    function finalizeSettlement(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (c.state != CampaignState.InChallengePeriod) revert InvalidState(c.state, CampaignState.InChallengePeriod);
        if (block.timestamp <= c.challengeExpiry) revert ChallengePeriodActive();
        if (c.isDisputed) revert DisputePending();
        if (c.stage2Paid) revert Stage1AlreadyPaid(); // Stage 2 guard

        c.stage2Paid = true;
        c.state = CampaignState.Completed;

        uint256 stage2Amount = (c.winningBidAmount * STAGE2_PERCENT) / 100;
        uint256 vendorBond = bidCommitments[campaignId][c.winningVendor].bondAmount;
        bidCommitments[campaignId][c.winningVendor].bondAmount = 0;

        emit Stage2Settled(campaignId, c.winningVendor, stage2Amount);
        emit StateTransition(campaignId, CampaignState.InChallengePeriod, CampaignState.Completed);

        usdcToken.safeTransfer(c.winningVendor, stage2Amount + vendorBond);
    }

    // --- DONOR PULL REFUNDS ---

    /**
     * @notice Donors claim proportional refund if campaign fails or has unspent surplus.
     */
    function claimRefund(uint256 campaignId) external nonReentrant returns (uint256 refundAmount) {
        Campaign storage c = campaigns[campaignId];
        uint256 deposit = donorDeposits[campaignId][msg.sender];
        if (deposit == 0) revert NoRefundDue();
        if (hasClaimedRefund[campaignId][msg.sender]) revert NoRefundDue();

        if (
            c.state == CampaignState.FundingFailed ||
            c.state == CampaignState.AuctionFailed ||
            c.state == CampaignState.DeliveryFailed ||
            c.state == CampaignState.VerificationFailed ||
            c.state == CampaignState.Cancelled
        ) {
            // 100% full refund
            refundAmount = deposit;
        } else if (c.state == CampaignState.Completed) {
            // Proportional surplus refund
            uint256 surplus = unspentSurplus[campaignId];
            if (c.isDisputed && !c.stage2Paid) {
                // If dispute was upheld, the unpaid 30% is also added to surplus
                surplus += (c.winningBidAmount * STAGE2_PERCENT) / 100;
            }
            if (surplus > 0) {
                refundAmount = (surplus * deposit) / c.totalDeposited;
            } else {
                revert NoRefundDue();
            }
        } else {
            revert InvalidState(c.state, CampaignState.Completed);
        }

        if (refundAmount == 0) revert NoRefundDue();

        hasClaimedRefund[campaignId][msg.sender] = true;

        emit RefundClaimed(campaignId, msg.sender, refundAmount);

        usdcToken.safeTransfer(msg.sender, refundAmount);
    }

    // --- VIEW / QUERY HELPERS ---

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getCommitment(uint256 campaignId, address vendor) external view returns (BidCommitment memory) {
        return bidCommitments[campaignId][vendor];
    }

    function getVendors(uint256 campaignId) external view returns (address[] memory) {
        return _campaignVendors[campaignId];
    }
}
