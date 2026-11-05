# OpenAid Protocol — Proposed Smart Contract Interfaces

> **STATUS NOTICE:**  
> The Solidity interfaces specified below represent the **proposed architectural boundaries** for OpenAid Protocol. They are subject to refinement and finalization during Milestone M1 smart contract development and security review.

---

## 1. `ICampaignRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICampaignRegistry {
    enum CampaignState {
        FundingActive,
        FundingFailed,
        BiddingCommit,
        BiddingReveal,
        AuctionFailed,
        AwaitingDelivery,
        DeliveryFailed,
        VerificationPending,
        VerificationFailed,
        InChallengePeriod,
        Disputed,
        Completed,
        Refunded
    }

    struct Campaign {
        uint256 campaignId;
        address creator;
        uint256 budgetCeiling;
        uint256 fundingDeadline;
        uint256 deliveryDeadline;
        string metadataCid;
        CampaignState state;
        address winningVendor;
        uint256 winningBidAmount;
    }

    // Events
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 budgetCeiling,
        uint256 fundingDeadline,
        uint256 deliveryDeadline,
        string metadataCid
    );
    event CampaignStateChanged(uint256 indexed campaignId, CampaignState previousState, CampaignState newState);

    // Custom Errors
    error InvalidBudget();
    error InvalidDeadline();
    error Unauthorized();
    error CampaignNotFound();
    error InvalidStateTransition(CampaignState current, CampaignState target);

    // External Functions
    function createCampaign(
        uint256 budgetCeiling,
        uint256 fundingDuration,
        uint256 deliveryDuration,
        string calldata metadataCid
    ) external returns (uint256 campaignId);

    function updateCampaignState(uint256 campaignId, CampaignState newState) external;
    function setWinningVendor(uint256 campaignId, address vendor, uint256 winningBid) external;
    function getCampaign(uint256 campaignId) external view returns (Campaign memory);
}
```

---

## 2. `IEscrowSettlement.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrowSettlement {
    struct EscrowAccounting {
        uint256 totalDeposited;
        uint256 budgetCeiling;
        uint256 winningBidAmount;
        uint256 stage1Disbursed;
        uint256 stage2Disbursed;
        uint256 surplusRefunded;
        uint256 challengeExpiry;
        bool isDisputed;
    }

    // Events
    event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount);
    event CampaignFullyFunded(uint256 indexed campaignId, uint256 totalAmount);
    event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
    event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 refundAmount);
    event ChallengeTimerStarted(uint256 indexed campaignId, uint256 expiryTimestamp);

    // Custom Errors
    error ZeroDeposit();
    error BudgetCeilingExceeded();
    error FundingPeriodEnded();
    error UnauthorizedCaller();
    error Stage1AlreadyPaid();
    error ChallengePeriodNotExpired();
    error CampaignCurrentlyDisputed();
    error NoRefundAvailable();
    error TokenTransferFailed();

    // External Functions
    function depositFunds(uint256 campaignId, uint256 amount) external;
    function executeStage1Settlement(uint256 campaignId, address vendor, uint256 winningBid) external;
    function executeStage2Settlement(uint256 campaignId) external;
    function claimRefund(uint256 campaignId) external returns (uint256 refundAmount);
    function lockDispute(uint256 campaignId) external;
    function resolveDisputeEscrow(uint256 campaignId, bool disputeUpheld) external;

    // View Functions
    function getDonorBalance(uint256 campaignId, address donor) external view returns (uint256);
    function getEscrowAccounting(uint256 campaignId) external view returns (EscrowAccounting memory);
    function getRefundableAmount(uint256 campaignId, address donor) external view returns (uint256);
}
```

---

## 3. `IProcurementAuction.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProcurementAuction {
    struct Auction {
        uint256 campaignId;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 lowestBid;
        address lowestBidder;
        uint256 totalCommitments;
        uint256 totalReveals;
        bool finalized;
    }

    struct Commitment {
        bytes32 commitHash;
        uint256 bondAmount;
        bool revealed;
    }

    // Events
    event AuctionOpened(uint256 indexed campaignId, uint256 commitDeadline, uint256 revealDeadline);
    event BidCommitted(uint256 indexed campaignId, address indexed vendor, bytes32 commitHash, uint256 bond);
    event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 bidAmount);
    event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningBid);
    event BondRefunded(uint256 indexed campaignId, address indexed vendor, uint256 amount);
    event BondSlashed(uint256 indexed campaignId, address indexed vendor, uint256 amount);

    // Custom Errors
    error CommitPhaseClosed();
    error CommitPhaseActive();
    error RevealPhaseClosed();
    error AlreadyCommitted();
    error InvalidCommitHash();
    error BidExceedsBudget();
    error NoBidsSubmitted();
    error AuctionAlreadyFinalized();
    error InsufficientBond();

    // External Functions
    function openAuction(uint256 campaignId, uint256 commitDuration, uint256 revealDuration) external;
    function commitBid(uint256 campaignId, bytes32 commitHash) external;
    function revealBid(uint256 campaignId, uint256 bidAmount, bytes32 salt) external;
    function finalizeAuction(uint256 campaignId) external returns (address winner, uint256 winningAmount);
    function claimBondRefund(uint256 campaignId) external;
    
    // View Functions
    function getAuction(uint256 campaignId) external view returns (Auction memory);
    function getCommitment(uint256 campaignId, address vendor) external view returns (Commitment memory);
}
```

---

## 4. `IValidatorRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IValidatorRegistry {
    struct DeliveryVerification {
        string evidenceIpfsCid;
        uint256 submissionTime;
        uint256 affirmativeVotes;
        uint256 negativeVotes;
        bool quorumReached;
        bool isDisputed;
        string disputeEvidenceCid;
    }

    // Events
    event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint256 timestamp);
    event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved);
    event QuorumReached(uint256 indexed campaignId, uint256 affirmativeCount);
    event DisputeRaised(uint256 indexed campaignId, address indexed challenger, string counterEvidenceCid);
    event DisputeResolved(uint256 indexed campaignId, bool disputeUpheld);

    // Custom Errors
    error NotAnAuthorizedValidator();
    error AlreadyVoted();
    error EvidenceNotSubmitted();
    error EvidenceAlreadySubmitted();
    error VotingPeriodExpired();
    error QuorumAlreadyReached();
    error ChallengePeriodExpired();
    error InsufficientDisputeBond();

    // External Functions
    function submitDeliveryEvidence(uint256 campaignId, string calldata ipfsCid) external;
    function castVote(uint256 campaignId, bool approve) external;
    function raiseDispute(uint256 campaignId, string calldata counterEvidenceCid) external;
    function resolveDispute(uint256 campaignId, bool upholdDispute) external;
    
    // View Functions
    function isValidator(address account) external view returns (bool);
    function hasVoted(uint256 campaignId, address validator) external view returns (bool);
    function getVerification(uint256 campaignId) external view returns (DeliveryVerification memory);
}
```

---

## 5. Inter-Contract Call Matrix & Permissions

| Caller Contract / Entity | Target Contract | Target Function | Access Control Guard | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Donor (EOA)** | `EscrowSettlement` | `depositFunds()` | Open during `FundingActive` | Direct capital deposit into escrow |
| **Donor (EOA)** | `EscrowSettlement` | `claimRefund()` | Pull pattern for valid refund states | Donor reclaims capital on failure/surplus |
| **Vendor (EOA)** | `ProcurementAuction` | `commitBid()`, `revealBid()` | Open during respective windows | Submit sealed cryptographic bids |
| **Winning Vendor (EOA)** | `ValidatorRegistry` | `submitDeliveryEvidence()` | `msg.sender == winningVendor` | Anchor IPFS manifest CID |
| **Validator (EOA)** | `ValidatorRegistry` | `castVote()` | `isAuthorizedValidator[msg.sender]` | Cast 1 of 5 quorum attestation votes |
| **`CampaignRegistry`** | `ProcurementAuction` | `openAuction()` | Authorized Registry caller | Trigger auction when campaign funded |
| **`ProcurementAuction`** | `CampaignRegistry` | `setWinningVendor()` | Authorized Auction caller | Lock winner details in registry |
| **`ValidatorRegistry`** | `EscrowSettlement` | `executeStage1Settlement()` | Authorized Registry caller | Disburse 70% upon 3-of-5 quorum |
| **`ValidatorRegistry`** | `EscrowSettlement` | `lockDispute()` | Authorized Registry caller | Freeze Stage 2 when challenge filed |
| **`EscrowSettlement`** | `IERC20 (Token)` | `safeTransfer()`, `safeTransferFrom()` | Internal state updated first (CEI) | Safe ERC-20 transfers |
