// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OpenAidEscrowV2
 * @notice OpenAid Protocol V2 — Multi-Category Sub-Vaults, Ranked Procurement Auction,
 *         Automated Backup Vendor Failover, and Validator Liveness Timeout.
 *
 * Prime Invariants:
 * 1. Zero Custody: Neither deployer, admin, nor NGO can arbitrarily sweep or withdraw funds.
 * 2. Strict 2-Path Exit: Funds leave escrow ONLY via Verified Staged Settlement (70/30) to
 *    the active winning vendor, or proportional refund to donors.
 * 3. Sub-Vault Isolation: Sub-vaults have independent budgets and state machines. Failure
 *    or dispute in one sub-vault never blocks or drains funds in another.
 * 4. Backup Vendor 15% Spread Cap: Defaulted Rank 1 vendor fails over to Rank 2 only if
 *    rank2Bid <= rank1Bid * 1.15 and rank2Bid <= subVaultBudget.
 */
contract OpenAidEscrowV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- ENUMS & STRUCTS ---

    enum SubVaultState {
        FundingActive,          // 0: Donors depositing USDC
        FundingFailed,          // 1: Funding deadline passed without target
        BiddingCommit,          // 2: Vendors submitting sealed bid hashes
        BiddingReveal,          // 3: Vendors revealing plain bid amounts
        AuctionFailed,          // 4: Zero valid reveals or criteria not met
        AwaitingDelivery,       // 5: Active winning vendor fulfilling delivery
        DeliveryFailed,         // 6: Delivery deadline passed without evidence
        VerificationPending,    // 7: Evidence committed; validators voting
        VerificationFailed,     // 8: Rejected by validators or liveness timeout exhausted
        InChallengePeriod,      // 9: Stage 1 paid; timelock window open
        Disputed,               // 10: Fraud challenge filed; Stage 2 locked
        PendingBackupAcceptance,// 11: Rank 1 defaulted; waiting for Rank 2 acceptance (48h window)
        Completed,              // 12: Stage 2 finalized or dispute resolved cleanly
        Refunded,               // 13: Terminal refund state (funds pulled by donors)
        Cancelled               // 14: Creator cancelled before procurement
    }

    struct SubVault {
        uint8 id;
        bytes32 categoryKey;
        uint256 budgetCeiling;
        uint256 totalDeposited;
        uint256 allocatedPayout;
        uint256 unspentSurplus;
        SubVaultState state;
        address winningVendor;
        uint256 winningBidAmount;
        address rank1Vendor;
        uint256 rank1BidAmount;
        address rank2Vendor;
        uint256 rank2BidAmount;
        address backupVendor;
        uint256 backupBidAmount;
        uint64 backupAcceptanceDeadline;
        bool backupAwarded;
        string evidenceIpfsCid;
        uint64 evidenceSubmittedAt;
        uint64 deliveryDeadline;
        uint8 validatorEpoch;
        uint8 affirmativeVotes;
        uint8 negativeVotes;
        bool stage1Paid;
        bool stage2Paid;
        uint64 challengeExpiry;
        bool isDisputed;
        string disputeEvidenceCid;
        address challenger;
        uint256 slashedDeficitSubsidy;
    }

    struct Campaign {
        uint256 id;
        address creator;
        uint8 subVaultCount;
        uint64 fundingDeadline;
        string metadataCid;
        bool isCancelled;
    }

    struct BidCommitment {
        bytes32 commitHash;
        uint256 bondAmount;
        bool revealed;
        uint256 revealedAmount;
        uint64 revealedAt;
    }

    struct SubVaultInitParams {
        bytes32 categoryKey;
        uint256 budgetCeiling;
        uint64 deliveryDurationSeconds;
    }

    // --- CATEGORY CONSTANTS ---

    bytes32 public constant CATEGORY_FOOD = keccak256("FOOD");
    bytes32 public constant CATEGORY_CLOTHES = keccak256("CLOTHES");
    bytes32 public constant CATEGORY_STATIONERY = keccak256("STATIONERY");
    bytes32 public constant CATEGORY_MEDICAL = keccak256("MEDICAL");

    // --- PROTOCOL CONSTANTS ---

    uint8 public constant QUORUM_THRESHOLD = 3;
    uint8 public constant TOTAL_VALIDATORS = 5;
    uint256 public constant STAGE1_PERCENT = 70;
    uint256 public constant STAGE2_PERCENT = 30;
    uint256 public constant BOND_BASIS_POINTS = 500; // 5% bid bond
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;
    uint256 public constant MAX_SPREAD_BPS = 1500; // 15.00% spread cap
    uint64 public constant BACKUP_ACCEPTANCE_WINDOW = 48 hours;

    // --- IMMUTABLE & CONFIGURATION STATE ---

    IERC20 public immutable usdcToken;
    address public immutable owner;
    uint64 public livenessTimeoutSeconds;

    uint256 public campaignCount;

    // --- STORAGE MAPPINGS ---

    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(uint8 => SubVault)) public subVaults;

    // Donor accounting per sub-vault: campaignId => subVaultId => donor => amount
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public donorSubVaultDeposits;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasClaimedSubVaultRefund;

    // Auction storage: campaignId => subVaultId => vendor => BidCommitment
    mapping(uint256 => mapping(uint8 => mapping(address => BidCommitment))) public bidCommitments;
    mapping(uint256 => mapping(uint8 => address[])) internal _subVaultVendors;
    mapping(uint256 => mapping(uint8 => uint64)) public commitDeadlines;
    mapping(uint256 => mapping(uint8 => uint64)) public revealDeadlines;
    mapping(uint256 => mapping(uint8 => uint64)) public deliveryDurations;

    // Validator panels per sub-vault: 5 active validators
    mapping(uint256 => mapping(uint8 => address[5])) public subVaultValidators;
    // Voting tracking: campaignId => subVaultId => validator => hasVoted
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public hasVoted;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public validatorVote;

    // Validator pool
    mapping(address => bool) public isValidator;
    address[] public initialValidatorsList;
    address[] public backupValidatorsList;
    mapping(address => bool) public isBackupValidator;

    // --- EVENTS ---

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint8 subVaultCount, string metadataCid, uint64 fundingDeadline);
    event SubVaultCreated(uint256 indexed campaignId, uint8 indexed subVaultId, bytes32 indexed categoryKey, uint256 budgetCeiling, uint64 deliveryDurationSeconds);
    event FundsDeposited(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed donor, uint256 amount);
    event SubVaultFullyFunded(uint256 indexed campaignId, uint8 indexed subVaultId, uint256 totalAmount);
    event AuctionOpened(uint256 indexed campaignId, uint8 indexed subVaultId, uint64 commitDeadline, uint64 revealDeadline);
    event BidCommitted(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed vendor, bytes32 commitHash, uint256 bondAmount);
    event BidRevealed(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed vendor, uint256 amount);
    event AuctionFinalized(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed winningVendor, uint256 winningAmount, address backupVendor, uint256 backupAmount);
    event EvidenceSubmitted(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed vendor, string ipfsCid, uint64 timestamp);
    event VoteCast(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed validator, bool approved);
    event QuorumReached(uint256 indexed campaignId, uint8 indexed subVaultId, uint8 affirmativeCount);
    event Stage1Settled(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed vendor, uint256 payoutAmount);
    event Stage2Settled(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed vendor, uint256 payoutAmount);
    event DisputeRaised(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed challenger, string counterEvidenceCid);
    event DisputeResolved(uint256 indexed campaignId, uint8 indexed subVaultId, bool upheld);
    event BackupVendorProposed(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed backupVendor, uint256 backupBid, uint64 acceptanceDeadline);
    event BackupVendorAccepted(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed backupVendor, uint256 bidAmount, uint64 newDeliveryDeadline);
    event BackupVendorRejected(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed backupVendor, uint256 bidAmount, string reason);
    event ValidatorTimeoutTriggered(uint256 indexed campaignId, uint8 indexed subVaultId, uint8 newEpoch, address[] replacedValidators, address[] newValidators);
    event RefundClaimed(uint256 indexed campaignId, uint8 indexed subVaultId, address indexed donor, uint256 amount);
    event FundingClosedEarly(uint256 indexed campaignId, uint8 indexed subVaultId, uint256 previousBudgetCeiling, uint256 finalBudget);
    event CampaignCancelled(uint256 indexed campaignId, address indexed creator);
    event SubVaultStateTransition(uint256 indexed campaignId, uint8 indexed subVaultId, SubVaultState previousState, SubVaultState newState);

    // --- CUSTOM ERRORS ---

    error ZeroAddress();
    error ZeroAmount();
    error InvalidState(SubVaultState current, SubVaultState expected);
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
    error InvalidSubVault();
    error BackupSpreadExceeded();
    error BackupWindowExpired();
    error BackupAlreadyAwarded();
    error NotBackupVendor();
    error LivenessTimeoutNotMet();
    error ReplacementRoundsExceeded();
    error CampaignAlreadyCancelled();
    error CannotCancelCampaign();

    // --- CONSTRUCTOR ---

    constructor(
        address _usdcToken,
        address[] memory _initialValidators,
        address[] memory _backupValidators,
        uint64 _livenessTimeout
    ) {
        if (_usdcToken == address(0)) revert ZeroAddress();
        usdcToken = IERC20(_usdcToken);
        owner = msg.sender;
        livenessTimeoutSeconds = _livenessTimeout > 0 ? _livenessTimeout : 72 hours;

        for (uint256 i = 0; i < _initialValidators.length; i++) {
            address v = _initialValidators[i];
            if (v != address(0)) {
                isValidator[v] = true;
                initialValidatorsList.push(v);
            }
        }

        for (uint256 i = 0; i < _backupValidators.length; i++) {
            address bv = _backupValidators[i];
            if (bv != address(0)) {
                isBackupValidator[bv] = true;
                backupValidatorsList.push(bv);
            }
        }
    }

    // --- CAMPAIGN & SUB-VAULT INITIALIZATION ---

    /**
     * @notice Create a parent campaign with multi-category isolated sub-vaults.
     */
    function createCampaign(
        uint64 fundingDurationSeconds,
        string calldata metadataCid,
        SubVaultInitParams[] calldata initSubVaults
    ) external returns (uint256 campaignId) {
        if (initSubVaults.length == 0) revert ZeroAmount();

        campaignId = ++campaignCount;
        uint64 fundingDeadline = uint64(block.timestamp) + fundingDurationSeconds;

        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            subVaultCount: uint8(initSubVaults.length),
            fundingDeadline: fundingDeadline,
            metadataCid: metadataCid,
            isCancelled: false
        });

        for (uint8 i = 0; i < initSubVaults.length; i++) {
            SubVaultInitParams calldata p = initSubVaults[i];
            if (p.budgetCeiling == 0) revert ZeroAmount();

            SubVault storage sv = subVaults[campaignId][i];
            sv.id = i;
            sv.categoryKey = p.categoryKey;
            sv.budgetCeiling = p.budgetCeiling;
            sv.state = SubVaultState.FundingActive;
            sv.validatorEpoch = 1;
            deliveryDurations[campaignId][i] = p.deliveryDurationSeconds;

            for (uint256 v = 0; v < 5 && v < initialValidatorsList.length; v++) {
                subVaultValidators[campaignId][i][v] = initialValidatorsList[v];
            }

            emit SubVaultCreated(campaignId, i, p.categoryKey, p.budgetCeiling, p.deliveryDurationSeconds);
        }

        emit CampaignCreated(campaignId, msg.sender, uint8(initSubVaults.length), metadataCid, fundingDeadline);
    }

    /**
     * @notice Single-category convenience overload.
     */
    function createCampaign(
        uint256 budgetCeiling,
        uint64 fundingDurationSeconds,
        uint64 deliveryDurationSeconds,
        string calldata metadataCid
    ) external returns (uint256 campaignId) {
        SubVaultInitParams[] memory init = new SubVaultInitParams[](1);
        init[0] = SubVaultInitParams({
            categoryKey: CATEGORY_FOOD,
            budgetCeiling: budgetCeiling,
            deliveryDurationSeconds: deliveryDurationSeconds
        });

        if (budgetCeiling == 0) revert ZeroAmount();

        campaignId = ++campaignCount;
        uint64 fundingDeadline = uint64(block.timestamp) + fundingDurationSeconds;

        campaigns[campaignId] = Campaign({
            id: campaignId,
            creator: msg.sender,
            subVaultCount: 1,
            fundingDeadline: fundingDeadline,
            metadataCid: metadataCid,
            isCancelled: false
        });

        SubVault storage sv = subVaults[campaignId][0];
        sv.id = 0;
        sv.categoryKey = CATEGORY_FOOD;
        sv.budgetCeiling = budgetCeiling;
        sv.state = SubVaultState.FundingActive;
        sv.validatorEpoch = 1;
        deliveryDurations[campaignId][0] = deliveryDurationSeconds;

        for (uint256 v = 0; v < 5 && v < initialValidatorsList.length; v++) {
            subVaultValidators[campaignId][0][v] = initialValidatorsList[v];
        }

        emit SubVaultCreated(campaignId, 0, CATEGORY_FOOD, budgetCeiling, deliveryDurationSeconds);
        emit CampaignCreated(campaignId, msg.sender, 1, metadataCid, fundingDeadline);
    }

    // --- DONOR FUNDING ---

    /**
     * @notice Deposit USDC directly into a specific sub-vault.
     */
    function depositFunds(uint256 campaignId, uint8 subVaultId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Campaign storage c = campaigns[campaignId];
        if (c.isCancelled) revert CampaignAlreadyCancelled();
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();
        if (block.timestamp > c.fundingDeadline) revert DeadlinePassed();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.FundingActive) revert InvalidState(sv.state, SubVaultState.FundingActive);
        if (sv.totalDeposited + amount > sv.budgetCeiling) revert BudgetCeilingExceeded();

        // Checks-Effects-Interactions
        sv.totalDeposited += amount;
        donorSubVaultDeposits[campaignId][subVaultId][msg.sender] += amount;

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        emit FundsDeposited(campaignId, subVaultId, msg.sender, amount);

        if (sv.totalDeposited == sv.budgetCeiling) {
            sv.state = SubVaultState.BiddingCommit;
            emit SubVaultFullyFunded(campaignId, subVaultId, sv.totalDeposited);
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.FundingActive, SubVaultState.BiddingCommit);
        }
    }

    /**
     * @notice Trigger funding failure for a sub-vault if deadline expired without reaching budget.
     */
    function triggerFundingTimeout(uint256 campaignId, uint8 subVaultId) external {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();
        if (block.timestamp <= c.fundingDeadline) revert DeadlineNotPassed();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.FundingActive) revert InvalidState(sv.state, SubVaultState.FundingActive);

        sv.state = SubVaultState.FundingFailed;
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.FundingActive, SubVaultState.FundingFailed);
    }

    // --- CREATOR CONTROLS ---

    /**
     * @notice Creator closes funding early for a sub-vault, lowering budgetCeiling to totalDeposited.
     *         Proceeds immediately to procurement with funds raised so far. Zero custody.
     */
    function closeFundingEarly(uint256 campaignId, uint8 subVaultId) external {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.creator) revert Unauthorized();
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.FundingActive) revert InvalidState(sv.state, SubVaultState.FundingActive);
        if (block.timestamp > c.fundingDeadline) revert DeadlinePassed();
        if (sv.totalDeposited == 0) revert ZeroAmount();

        uint256 previousCeiling = sv.budgetCeiling;
        sv.budgetCeiling = sv.totalDeposited;
        sv.state = SubVaultState.BiddingCommit;

        emit FundingClosedEarly(campaignId, subVaultId, previousCeiling, sv.totalDeposited);
        emit SubVaultFullyFunded(campaignId, subVaultId, sv.totalDeposited);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.FundingActive, SubVaultState.BiddingCommit);
    }

    /**
     * @notice Creator cancels an unfunded/un-auctioned campaign. Enables 100% pull refunds for donors.
     */
    function cancelCampaign(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.creator) revert Unauthorized();
        if (c.isCancelled) revert CampaignAlreadyCancelled();

        for (uint8 i = 0; i < c.subVaultCount; i++) {
            SubVault storage sv = subVaults[campaignId][i];
            bool cancellable = (sv.state == SubVaultState.FundingActive ||
                (sv.state == SubVaultState.BiddingCommit && commitDeadlines[campaignId][i] == 0));
            if (!cancellable) revert CannotCancelCampaign();
        }

        c.isCancelled = true;

        for (uint8 i = 0; i < c.subVaultCount; i++) {
            SubVault storage sv = subVaults[campaignId][i];
            SubVaultState prev = sv.state;
            sv.state = SubVaultState.Cancelled;
            emit SubVaultStateTransition(campaignId, i, prev, SubVaultState.Cancelled);
        }

        emit CampaignCancelled(campaignId, msg.sender);
    }

    // --- PROCUREMENT AUCTION (COMMIT–REVEAL & RANK TRACKING) ---

    /**
     * @notice Open procurement auction commit and reveal windows for a sub-vault.
     */
    function openAuction(uint256 campaignId, uint8 subVaultId, uint64 commitDuration, uint64 revealDuration) external {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.BiddingCommit) revert InvalidState(sv.state, SubVaultState.BiddingCommit);
        if (commitDeadlines[campaignId][subVaultId] != 0) revert InvalidState(sv.state, SubVaultState.BiddingCommit);

        commitDeadlines[campaignId][subVaultId] = uint64(block.timestamp) + commitDuration;
        revealDeadlines[campaignId][subVaultId] = uint64(block.timestamp) + commitDuration + revealDuration;

        emit AuctionOpened(campaignId, subVaultId, commitDeadlines[campaignId][subVaultId], revealDeadlines[campaignId][subVaultId]);
    }

    /**
     * @notice Vendor commits a sealed bid hash with mandatory 5% bid bond.
     *         commitHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender))
     */
    function commitBid(uint256 campaignId, uint8 subVaultId, bytes32 commitHash) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.BiddingCommit) revert InvalidState(sv.state, SubVaultState.BiddingCommit);
        if (block.timestamp > commitDeadlines[campaignId][subVaultId]) revert DeadlinePassed();
        if (bidCommitments[campaignId][subVaultId][msg.sender].commitHash != bytes32(0)) revert AlreadyCommitted();

        uint256 requiredBond = (sv.budgetCeiling * BOND_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;

        bidCommitments[campaignId][subVaultId][msg.sender] = BidCommitment({
            commitHash: commitHash,
            bondAmount: requiredBond,
            revealed: false,
            revealedAmount: 0,
            revealedAt: 0
        });
        _subVaultVendors[campaignId][subVaultId].push(msg.sender);

        usdcToken.safeTransferFrom(msg.sender, address(this), requiredBond);

        emit BidCommitted(campaignId, subVaultId, msg.sender, commitHash, requiredBond);
    }

    /**
     * @notice Advance sub-vault from commit phase to reveal phase.
     */
    function advanceToReveal(uint256 campaignId, uint8 subVaultId) external {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.BiddingCommit) revert InvalidState(sv.state, SubVaultState.BiddingCommit);
        if (block.timestamp <= commitDeadlines[campaignId][subVaultId]) revert DeadlineNotPassed();

        if (_subVaultVendors[campaignId][subVaultId].length == 0) {
            sv.state = SubVaultState.AuctionFailed;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.BiddingCommit, SubVaultState.AuctionFailed);
        } else {
            sv.state = SubVaultState.BiddingReveal;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.BiddingCommit, SubVaultState.BiddingReveal);
        }
    }

    /**
     * @notice Reveal sealed bid. Dynamically sorts revealed bids to track Rank 1 (lowest) and Rank 2 (second lowest).
     */
    function revealBid(uint256 campaignId, uint8 subVaultId, uint256 bidAmount, bytes32 salt) external {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.BiddingReveal) revert InvalidState(sv.state, SubVaultState.BiddingReveal);
        if (block.timestamp > revealDeadlines[campaignId][subVaultId]) revert DeadlinePassed();

        BidCommitment storage b = bidCommitments[campaignId][subVaultId][msg.sender];
        if (b.commitHash == bytes32(0)) revert Unauthorized();
        if (b.revealed) revert AlreadyCommitted();

        bytes32 expectedHash = keccak256(abi.encodePacked(bidAmount, salt, msg.sender));
        if (expectedHash != b.commitHash) revert InvalidCommitment();
        if (bidAmount > sv.budgetCeiling) revert BidExceedsBudget();

        b.revealed = true;
        b.revealedAmount = bidAmount;
        b.revealedAt = uint64(block.timestamp);

        // Track Rank 1 (lowest bid) and Rank 2 (second lowest bid)
        if (sv.rank1Vendor == address(0)) {
            sv.rank1Vendor = msg.sender;
            sv.rank1BidAmount = bidAmount;
        } else if (bidAmount < sv.rank1BidAmount) {
            // New lowest bid: demote previous rank1 to rank2
            sv.rank2Vendor = sv.rank1Vendor;
            sv.rank2BidAmount = sv.rank1BidAmount;
            sv.rank1Vendor = msg.sender;
            sv.rank1BidAmount = bidAmount;
        } else if (sv.rank2Vendor == address(0) || bidAmount < sv.rank2BidAmount) {
            // Second lowest bid
            sv.rank2Vendor = msg.sender;
            sv.rank2BidAmount = bidAmount;
        }

        emit BidRevealed(campaignId, subVaultId, msg.sender, bidAmount);
    }

    /**
     * @notice Finalize the procurement auction: locks Rank 1 and Rank 2 bonds; refunds Rank 3+ bonds immediately.
     */
    function finalizeAuction(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.BiddingReveal) revert InvalidState(sv.state, SubVaultState.BiddingReveal);
        if (block.timestamp <= revealDeadlines[campaignId][subVaultId]) revert DeadlineNotPassed();

        if (sv.rank1Vendor == address(0)) {
            sv.state = SubVaultState.AuctionFailed;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.BiddingReveal, SubVaultState.AuctionFailed);
            return;
        }

        sv.winningVendor = sv.rank1Vendor;
        sv.winningBidAmount = sv.rank1BidAmount;
        sv.allocatedPayout = sv.rank1BidAmount;
        sv.backupVendor = sv.rank2Vendor;
        sv.backupBidAmount = sv.rank2BidAmount;
        sv.state = SubVaultState.AwaitingDelivery;
        sv.deliveryDeadline = uint64(block.timestamp) + deliveryDurations[campaignId][subVaultId];

        // Surplus calculation: budgetCeiling - winningBidAmount
        if (sv.budgetCeiling > sv.rank1BidAmount) {
            sv.unspentSurplus = sv.budgetCeiling - sv.rank1BidAmount;
        }

        // Lock Rank 1 and Rank 2 bonds; refund Rank 3+ vendor bonds immediately
        address[] memory vendors = _subVaultVendors[campaignId][subVaultId];
        for (uint256 i = 0; i < vendors.length; i++) {
            address v = vendors[i];
            if (v != sv.rank1Vendor && v != sv.rank2Vendor) {
                BidCommitment storage b = bidCommitments[campaignId][subVaultId][v];
                if (b.revealed && b.bondAmount > 0) {
                    uint256 refundBond = b.bondAmount;
                    b.bondAmount = 0;
                    usdcToken.safeTransfer(v, refundBond);
                } else if (!b.revealed) {
                    // Non-revealed vendor bond slashed
                    b.bondAmount = 0;
                }
            }
        }

        emit AuctionFinalized(campaignId, subVaultId, sv.winningVendor, sv.winningBidAmount, sv.backupVendor, sv.backupBidAmount);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.BiddingReveal, SubVaultState.AwaitingDelivery);
    }

    // --- DELIVERY EVIDENCE SUBMISSION ---

    /**
     * @notice Active winning vendor submits delivery evidence IPFS CID.
     */
    function submitDeliveryEvidence(uint256 campaignId, uint8 subVaultId, string calldata ipfsCid) external {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.AwaitingDelivery) revert InvalidState(sv.state, SubVaultState.AwaitingDelivery);
        if (msg.sender != sv.winningVendor) revert Unauthorized();
        if (block.timestamp > sv.deliveryDeadline) revert DeadlinePassed();
        if (bytes(ipfsCid).length == 0) revert ZeroAmount();

        sv.evidenceIpfsCid = ipfsCid;
        sv.evidenceSubmittedAt = uint64(block.timestamp);
        sv.state = SubVaultState.VerificationPending;

        emit EvidenceSubmitted(campaignId, subVaultId, msg.sender, ipfsCid, uint64(block.timestamp));
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.AwaitingDelivery, SubVaultState.VerificationPending);
    }

    /**
     * @notice Trigger delivery timeout if deadline passed without evidence. Initiates backup failover.
     */
    function triggerDeliveryTimeout(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.AwaitingDelivery) revert InvalidState(sv.state, SubVaultState.AwaitingDelivery);
        if (block.timestamp <= sv.deliveryDeadline) revert DeadlineNotPassed();

        _executeBackupFailover(campaignId, subVaultId);
    }

    // --- BACKUP VENDOR AUTO-FAILOVER ---

    /**
     * @notice Reassign sub-vault to backup vendor when primary defaults.
     */
    function reassignToBackupVendor(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state == SubVaultState.AwaitingDelivery) {
            if (block.timestamp <= sv.deliveryDeadline) revert DeadlineNotPassed();
        } else if (sv.state != SubVaultState.DeliveryFailed) {
            revert InvalidState(sv.state, SubVaultState.AwaitingDelivery);
        }

        _executeBackupFailover(campaignId, subVaultId);
    }

    function _executeBackupFailover(uint256 campaignId, uint8 subVaultId) internal {
        SubVault storage sv = subVaults[campaignId][subVaultId];
        SubVaultState previousState = sv.state;

        // Slash Rank 1 bond
        address rank1 = sv.winningVendor;
        uint256 rank1Bond = bidCommitments[campaignId][subVaultId][rank1].bondAmount;
        bidCommitments[campaignId][subVaultId][rank1].bondAmount = 0;

        // If no backup vendor or backup was already awarded, abort to donor refund
        if (sv.rank2Vendor == address(0) || sv.backupAwarded) {
            sv.state = SubVaultState.Refunded;
            emit SubVaultStateTransition(campaignId, subVaultId, previousState, SubVaultState.Refunded);
            return;
        }

        uint256 rank1Bid = sv.rank1BidAmount;
        uint256 rank2Bid = sv.rank2BidAmount;
        uint256 maxAllowedBid = rank1Bid + (rank1Bid * MAX_SPREAD_BPS) / BASIS_POINTS_DENOMINATOR;

        // Check 15% spread cap AND subVault budget ceiling
        if (rank2Bid > maxAllowedBid || rank2Bid > sv.budgetCeiling) {
            sv.state = SubVaultState.Refunded;
            emit BackupVendorRejected(campaignId, subVaultId, sv.rank2Vendor, rank2Bid, "Spread or budget exceeded");
            emit SubVaultStateTransition(campaignId, subVaultId, previousState, SubVaultState.Refunded);
            return;
        }

        // Slashed bond of Rank 1 offsets price deficit (rank2Bid - rank1Bid)
        uint256 deficit = rank2Bid > rank1Bid ? (rank2Bid - rank1Bid) : 0;
        uint256 subsidy = deficit > rank1Bond ? rank1Bond : deficit;
        sv.slashedDeficitSubsidy = subsidy;

        // 48-hour acceptance window for Rank 2
        sv.backupAcceptanceDeadline = uint64(block.timestamp) + BACKUP_ACCEPTANCE_WINDOW;
        sv.state = SubVaultState.PendingBackupAcceptance;

        emit BackupVendorProposed(campaignId, subVaultId, sv.rank2Vendor, rank2Bid, sv.backupAcceptanceDeadline);
        emit SubVaultStateTransition(campaignId, subVaultId, previousState, SubVaultState.PendingBackupAcceptance);
    }

    /**
     * @notice Rank 2 vendor accepts assignment within 48-hour window and activates contract.
     */
    function acceptBackupAssignment(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.PendingBackupAcceptance) revert InvalidState(sv.state, SubVaultState.PendingBackupAcceptance);
        if (msg.sender != sv.rank2Vendor) revert NotBackupVendor();
        if (block.timestamp > sv.backupAcceptanceDeadline) revert BackupWindowExpired();
        if (sv.backupAwarded) revert BackupAlreadyAwarded();

        // Verify/ensure 5% performance bond is locked
        BidCommitment storage b = bidCommitments[campaignId][subVaultId][msg.sender];
        uint256 requiredBond = (sv.budgetCeiling * BOND_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
        if (b.bondAmount < requiredBond) {
            uint256 deficitBond = requiredBond - b.bondAmount;
            b.bondAmount = requiredBond;
            usdcToken.safeTransferFrom(msg.sender, address(this), deficitBond);
        }

        // Rank 2 becomes active winning vendor with fresh delivery timer (single fallback only)
        sv.backupAwarded = true;
        sv.winningVendor = msg.sender;
        sv.winningBidAmount = sv.rank2BidAmount;
        sv.allocatedPayout = sv.rank2BidAmount;

        // Clear rank 2 and backup vendor so cannot failover again
        sv.rank2Vendor = address(0);
        sv.rank2BidAmount = 0;
        sv.backupVendor = address(0);
        sv.backupBidAmount = 0;

        // Fresh delivery timer
        sv.deliveryDeadline = uint64(block.timestamp) + deliveryDurations[campaignId][subVaultId];
        sv.evidenceIpfsCid = "";
        sv.evidenceSubmittedAt = 0;
        sv.affirmativeVotes = 0;
        sv.negativeVotes = 0;
        sv.stage1Paid = false;
        sv.stage2Paid = false;
        sv.state = SubVaultState.AwaitingDelivery;

        if (sv.budgetCeiling > sv.winningBidAmount) {
            sv.unspentSurplus = sv.budgetCeiling - sv.winningBidAmount;
        } else {
            sv.unspentSurplus = 0;
        }

        emit BackupVendorAccepted(campaignId, subVaultId, msg.sender, sv.winningBidAmount, sv.deliveryDeadline);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.PendingBackupAcceptance, SubVaultState.AwaitingDelivery);
    }

    /**
     * @notice Rank 2 vendor explicitly declines backup assignment. Sub-vault transitions to Refunded.
     */
    function declineBackupAssignment(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.PendingBackupAcceptance) revert InvalidState(sv.state, SubVaultState.PendingBackupAcceptance);
        if (msg.sender != sv.rank2Vendor) revert NotBackupVendor();

        // Refund Rank 2's bond since they declined within window
        uint256 bond = bidCommitments[campaignId][subVaultId][msg.sender].bondAmount;
        if (bond > 0) {
            bidCommitments[campaignId][subVaultId][msg.sender].bondAmount = 0;
            usdcToken.safeTransfer(msg.sender, bond);
        }

        sv.state = SubVaultState.Refunded;
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.PendingBackupAcceptance, SubVaultState.Refunded);
    }

    /**
     * @notice Trigger timeout if Rank 2 fails to accept within 48-hour window. Sub-vault transitions to Refunded.
     */
    function triggerBackupAcceptanceTimeout(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.PendingBackupAcceptance) revert InvalidState(sv.state, SubVaultState.PendingBackupAcceptance);
        if (block.timestamp <= sv.backupAcceptanceDeadline) revert DeadlineNotPassed();

        address r2 = sv.rank2Vendor;
        if (r2 != address(0)) {
            uint256 bond = bidCommitments[campaignId][subVaultId][r2].bondAmount;
            if (bond > 0) {
                bidCommitments[campaignId][subVaultId][r2].bondAmount = 0;
                usdcToken.safeTransfer(r2, bond);
            }
        }

        sv.state = SubVaultState.Refunded;
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.PendingBackupAcceptance, SubVaultState.Refunded);
    }

    // --- VALIDATOR QUORUM & TIMEOUT ---

    /**
     * @notice Cast vote on delivery evidence. Quorum of 3 affirmative votes releases Stage 1 (70%).
     */
    function castVote(
        uint256 campaignId,
        uint8 subVaultId,
        bool approve,
        uint64 challengeWindowSeconds
    ) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.VerificationPending) revert InvalidState(sv.state, SubVaultState.VerificationPending);

        bool isAuthorized = false;
        for (uint256 i = 0; i < 5; i++) {
            if (subVaultValidators[campaignId][subVaultId][i] == msg.sender) {
                isAuthorized = true;
                break;
            }
        }
        if (!isAuthorized) revert NotAnAuthorizedValidator();
        if (hasVoted[campaignId][subVaultId][msg.sender]) revert AlreadyVoted();

        hasVoted[campaignId][subVaultId][msg.sender] = true;
        validatorVote[campaignId][subVaultId][msg.sender] = approve;

        if (approve) {
            sv.affirmativeVotes++;
        } else {
            sv.negativeVotes++;
        }

        emit VoteCast(campaignId, subVaultId, msg.sender, approve);

        // 3 negative votes -> reject
        if (sv.negativeVotes >= QUORUM_THRESHOLD) {
            sv.state = SubVaultState.VerificationFailed;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.VerificationPending, SubVaultState.VerificationFailed);
            return;
        }

        // 3 affirmative votes -> Stage 1 (70%) paid
        if (sv.affirmativeVotes >= QUORUM_THRESHOLD && !sv.stage1Paid) {
            _executeStage1(campaignId, subVaultId, challengeWindowSeconds);
        }
    }

    function _executeStage1(uint256 campaignId, uint8 subVaultId, uint64 challengeWindowSeconds) internal {
        SubVault storage sv = subVaults[campaignId][subVaultId];
        sv.stage1Paid = true;
        sv.state = SubVaultState.InChallengePeriod;
        sv.challengeExpiry = uint64(block.timestamp) + (challengeWindowSeconds > 0 ? challengeWindowSeconds : 72 hours);

        uint256 stage1Amount = (sv.winningBidAmount * STAGE1_PERCENT) / 100;

        emit QuorumReached(campaignId, subVaultId, sv.affirmativeVotes);
        emit Stage1Settled(campaignId, subVaultId, sv.winningVendor, stage1Amount);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.VerificationPending, SubVaultState.InChallengePeriod);

        usdcToken.safeTransfer(sv.winningVendor, stage1Amount);
    }

    /**
     * @notice Permissionless validator liveness timeout trigger.
     *         Retains existing votes; replaces non-voting validators with alternates from approved backup pool.
     */
    function triggerValidatorTimeout(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.VerificationPending) revert InvalidState(sv.state, SubVaultState.VerificationPending);
        if (block.timestamp <= sv.evidenceSubmittedAt + livenessTimeoutSeconds) revert LivenessTimeoutNotMet();
        if (sv.affirmativeVotes >= QUORUM_THRESHOLD || sv.negativeVotes >= QUORUM_THRESHOLD) revert InvalidState(sv.state, SubVaultState.VerificationPending);

        // Maximum 2 replacement rounds (epochs 1 -> 2 -> 3). After round 2, sub-vault transitions to VerificationFailed.
        if (sv.validatorEpoch >= 3) {
            sv.state = SubVaultState.VerificationFailed;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.VerificationPending, SubVaultState.VerificationFailed);
            return;
        }

        address[] memory replaced = new address[](5);
        address[] memory added = new address[](5);
        uint256 replaceCount = 0;

        // Iterate over current panel, replacing non-voting validators
        for (uint256 i = 0; i < 5; i++) {
            address currentVal = subVaultValidators[campaignId][subVaultId][i];
            if (!hasVoted[campaignId][subVaultId][currentVal]) {
                // Find alternate from backup pool not currently on the panel and hasn't voted
                address alternate = address(0);
                for (uint256 j = 0; j < backupValidatorsList.length; j++) {
                    address candidate = backupValidatorsList[j];
                    if (!hasVoted[campaignId][subVaultId][candidate]) {
                        bool alreadyOnPanel = false;
                        for (uint256 k = 0; k < 5; k++) {
                            if (subVaultValidators[campaignId][subVaultId][k] == candidate) {
                                alreadyOnPanel = true;
                                break;
                            }
                        }
                        if (!alreadyOnPanel) {
                            alternate = candidate;
                            break;
                        }
                    }
                }

                if (alternate != address(0)) {
                    replaced[replaceCount] = currentVal;
                    added[replaceCount] = alternate;
                    subVaultValidators[campaignId][subVaultId][i] = alternate;
                    isValidator[alternate] = true;
                    replaceCount++;
                }
            }
        }

        if (replaceCount == 0) {
            // Backup pool exhausted: transition to VerificationFailed
            sv.state = SubVaultState.VerificationFailed;
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.VerificationPending, SubVaultState.VerificationFailed);
            return;
        }

        sv.validatorEpoch++;
        sv.evidenceSubmittedAt = uint64(block.timestamp); // reset timer for new validators

        // Create sized return arrays for event
        address[] memory finalReplaced = new address[](replaceCount);
        address[] memory finalAdded = new address[](replaceCount);
        for (uint256 i = 0; i < replaceCount; i++) {
            finalReplaced[i] = replaced[i];
            finalAdded[i] = added[i];
        }

        emit ValidatorTimeoutTriggered(campaignId, subVaultId, sv.validatorEpoch, finalReplaced, finalAdded);
    }

    // --- CHALLENGE & DISPUTE MECHANISM ---

    /**
     * @notice Raise a dispute during challenge period. Requires 10% dispute bond.
     */
    function raiseDispute(uint256 campaignId, uint8 subVaultId, string calldata counterEvidenceCid) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.InChallengePeriod) revert InvalidState(sv.state, SubVaultState.InChallengePeriod);
        if (block.timestamp > sv.challengeExpiry) revert DeadlinePassed();

        uint256 disputeBond = (sv.winningBidAmount * 10) / 100;
        sv.isDisputed = true;
        sv.disputeEvidenceCid = counterEvidenceCid;
        sv.challenger = msg.sender;
        sv.state = SubVaultState.Disputed;

        usdcToken.safeTransferFrom(msg.sender, address(this), disputeBond);

        emit DisputeRaised(campaignId, subVaultId, msg.sender, counterEvidenceCid);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.InChallengePeriod, SubVaultState.Disputed);
    }

    /**
     * @notice Resolve active dispute via authorized validator.
     */
    function resolveDispute(uint256 campaignId, uint8 subVaultId, bool upholdDispute) external nonReentrant {
        if (!isValidator[msg.sender]) revert NotAnAuthorizedValidator();
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.Disputed) revert InvalidState(sv.state, SubVaultState.Disputed);

        uint256 disputeBond = (sv.winningBidAmount * 10) / 100;

        if (upholdDispute) {
            // Dispute upheld: Vendor loses bond; challenger rewarded
            uint256 vendorBond = bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount;
            bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(sv.challenger, disputeBond + (vendorBond / 2));
            emit DisputeResolved(campaignId, subVaultId, true);

            // Execute backup failover for remaining obligations
            _executeBackupFailover(campaignId, subVaultId);
        } else {
            // Dispute dismissed: Challenger loses bond; Vendor gets Stage 2 + bond
            sv.stage2Paid = true;
            sv.state = SubVaultState.Completed;

            uint256 stage2Amount = (sv.winningBidAmount * STAGE2_PERCENT) / 100;
            uint256 vendorBond = bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount;
            bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount = 0;

            usdcToken.safeTransfer(sv.winningVendor, stage2Amount + vendorBond + (disputeBond / 2));

            emit DisputeResolved(campaignId, subVaultId, false);
            emit Stage2Settled(campaignId, subVaultId, sv.winningVendor, stage2Amount);
            emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.Disputed, SubVaultState.Completed);
        }
    }

    // --- FINAL STAGE 2 SETTLEMENT ---

    /**
     * @notice Finalize Stage 2 (30%) payout after clean challenge period expiration.
     */
    function finalizeSettlement(uint256 campaignId, uint8 subVaultId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        if (sv.state != SubVaultState.InChallengePeriod) revert InvalidState(sv.state, SubVaultState.InChallengePeriod);
        if (block.timestamp <= sv.challengeExpiry) revert ChallengePeriodActive();
        if (sv.isDisputed) revert DisputePending();
        if (sv.stage2Paid) revert Stage1AlreadyPaid();

        sv.stage2Paid = true;
        sv.state = SubVaultState.Completed;

        uint256 stage2Amount = (sv.winningBidAmount * STAGE2_PERCENT) / 100;
        uint256 vendorBond = bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount;
        bidCommitments[campaignId][subVaultId][sv.winningVendor].bondAmount = 0;

        emit Stage2Settled(campaignId, subVaultId, sv.winningVendor, stage2Amount);
        emit SubVaultStateTransition(campaignId, subVaultId, SubVaultState.InChallengePeriod, SubVaultState.Completed);

        usdcToken.safeTransfer(sv.winningVendor, stage2Amount + vendorBond);
    }

    // --- DONOR PULL REFUNDS ---

    /**
     * @notice Donors claim proportional refund from a specific sub-vault.
     *         Sub-vault isolation ensures failure in one vault never blocks or drains another.
     */
    function claimRefund(uint256 campaignId, uint8 subVaultId) external nonReentrant returns (uint256 refundAmount) {
        Campaign storage c = campaigns[campaignId];
        if (subVaultId >= c.subVaultCount) revert InvalidSubVault();

        SubVault storage sv = subVaults[campaignId][subVaultId];
        uint256 deposit = donorSubVaultDeposits[campaignId][subVaultId][msg.sender];
        if (deposit == 0) revert NoRefundDue();
        if (hasClaimedSubVaultRefund[campaignId][subVaultId][msg.sender]) revert NoRefundDue();

        if (
            sv.state == SubVaultState.FundingFailed ||
            sv.state == SubVaultState.AuctionFailed ||
            sv.state == SubVaultState.DeliveryFailed ||
            sv.state == SubVaultState.VerificationFailed ||
            sv.state == SubVaultState.Refunded ||
            sv.state == SubVaultState.Cancelled
        ) {
            if (sv.stage1Paid) {
                // If Stage 1 (70%) was already disbursed, refund proportional share of remaining 30%
                uint256 disbursed = (sv.winningBidAmount * STAGE1_PERCENT) / 100;
                uint256 remainingPool = sv.totalDeposited > disbursed ? (sv.totalDeposited - disbursed) : 0;
                refundAmount = (remainingPool * deposit) / sv.totalDeposited;
            } else {
                // 100% full refund of deposit in this sub-vault
                refundAmount = deposit;
            }
        } else if (sv.state == SubVaultState.Completed) {
            // Proportional share of unspent surplus
            uint256 surplus = sv.unspentSurplus;
            if (surplus > 0) {
                refundAmount = (surplus * deposit) / sv.totalDeposited;
            } else {
                revert NoRefundDue();
            }
        } else {
            revert InvalidState(sv.state, SubVaultState.Completed);
        }

        if (refundAmount == 0) revert NoRefundDue();

        hasClaimedSubVaultRefund[campaignId][subVaultId][msg.sender] = true;

        emit RefundClaimed(campaignId, subVaultId, msg.sender, refundAmount);

        usdcToken.safeTransfer(msg.sender, refundAmount);
    }

    // --- ADMINISTRATIVE & REGISTRY HELPERS ---

    function addBackupValidator(address _validator) external {
        if (msg.sender != owner) revert Unauthorized();
        if (_validator == address(0)) revert ZeroAddress();
        isBackupValidator[_validator] = true;
        backupValidatorsList.push(_validator);
    }

    function setLivenessTimeout(uint64 newTimeout) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newTimeout == 0) revert ZeroAmount();
        livenessTimeoutSeconds = newTimeout;
    }

    // --- VIEW / QUERY HELPERS ---

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getSubVault(uint256 campaignId, uint8 subVaultId) external view returns (SubVault memory) {
        return subVaults[campaignId][subVaultId];
    }

    function getSubVaultValidators(uint256 campaignId, uint8 subVaultId) external view returns (address[5] memory) {
        return subVaultValidators[campaignId][subVaultId];
    }

    function getSubVaultVendors(uint256 campaignId, uint8 subVaultId) external view returns (address[] memory) {
        return _subVaultVendors[campaignId][subVaultId];
    }

    function getBidCommitment(uint256 campaignId, uint8 subVaultId, address vendor) external view returns (BidCommitment memory) {
        return bidCommitments[campaignId][subVaultId][vendor];
    }

    function getBackupValidators() external view returns (address[] memory) {
        return backupValidatorsList;
    }
}
