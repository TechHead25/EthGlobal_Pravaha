/**
 * OpenAid Protocol — ABI Definitions for OpenAidEscrow and ERC20 Token Interface
 */

export const OPENAID_ESCROW_ABI = [
  "function usdcToken() external view returns (address)",
  "function owner() external view returns (address)",
  "function campaignCount() external view returns (uint256)",
  "function QUORUM_THRESHOLD() external view returns (uint8)",
  "function TOTAL_VALIDATORS() external view returns (uint8)",
  "function isValidator(address) external view returns (bool)",
  "function donorDeposits(uint256 campaignId, address donor) external view returns (uint256)",
  "function hasClaimedRefund(uint256 campaignId, address donor) external view returns (bool)",
  "function getCampaign(uint256 campaignId) external view returns (tuple(uint256 id, address creator, uint256 budgetCeiling, uint256 totalDeposited, uint64 fundingDeadline, uint64 deliveryDeadline, string metadataCid, uint8 state, address winningVendor, uint256 winningBidAmount, string evidenceIpfsCid, uint64 evidenceSubmittedAt, uint8 affirmativeVotes, uint8 negativeVotes, bool stage1Paid, bool stage2Paid, uint64 challengeExpiry, bool isDisputed, string disputeEvidenceCid, address challenger))",
  "function depositFunds(uint256 campaignId, uint256 amount) external",
  "function claimRefund(uint256 campaignId) external returns (uint256)",
  "event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount)",
  "event CampaignFullyFunded(uint256 indexed campaignId, uint256 totalAmount)",
  "event StateTransition(uint256 indexed campaignId, uint8 previousState, uint8 newState)"
] as const;

export const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
] as const;

/**
 * Complete OpenAidEscrow V1 interface (functions, events, custom errors) used by the
 * role workspaces and transparency views. Mirrors contracts/core/OpenAidEscrow.sol.
 */
export const OPENAID_ESCROW_FULL_ABI = [
  ...OPENAID_ESCROW_ABI,
  "function commitDeadlines(uint256 campaignId) external view returns (uint64)",
  "function revealDeadlines(uint256 campaignId) external view returns (uint64)",
  "function hasVoted(uint256 campaignId, address validator) external view returns (bool)",
  "function unspentSurplus(uint256 campaignId) external view returns (uint256)",
  "function BOND_BASIS_POINTS() external view returns (uint256)",
  "function getCommitment(uint256 campaignId, address vendor) external view returns (tuple(bytes32 commitHash, uint256 bondAmount, bool revealed, uint256 revealedAmount, uint64 revealedAt))",
  "function getVendors(uint256 campaignId) external view returns (address[])",
  "function createCampaign(uint256 budgetCeiling, uint64 fundingDurationSeconds, uint64 deliveryDurationSeconds, string metadataCid) external returns (uint256)",
  "function triggerFundingTimeout(uint256 campaignId) external",
  "function openAuction(uint256 campaignId, uint64 commitDuration, uint64 revealDuration) external",
  "function commitBid(uint256 campaignId, bytes32 commitHash) external",
  "function advanceToReveal(uint256 campaignId) external",
  "function revealBid(uint256 campaignId, uint256 bidAmount, bytes32 salt) external",
  "function finalizeAuction(uint256 campaignId) external",
  "function submitDeliveryEvidence(uint256 campaignId, string ipfsCid) external",
  "function triggerDeliveryTimeout(uint256 campaignId) external",
  "function castVote(uint256 campaignId, bool approve, uint64 challengeWindowSeconds) external",
  "function raiseDispute(uint256 campaignId, string counterEvidenceCid) external",
  "function finalizeSettlement(uint256 campaignId) external",
  "function resolveDispute(uint256 campaignId, bool upholdDispute) external",
  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint256 budgetCeiling, string metadataCid, uint64 fundingDeadline, uint64 deliveryDeadline)",
  "event AuctionOpened(uint256 indexed campaignId, uint64 commitDeadline, uint64 revealDeadline)",
  "event BidCommitted(uint256 indexed campaignId, address indexed vendor, bytes32 commitHash, uint256 bondAmount)",
  "event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 amount)",
  "event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningAmount)",
  "event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint64 timestamp)",
  "event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved)",
  "event QuorumReached(uint256 indexed campaignId, uint8 affirmativeCount)",
  "event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount)",
  "event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount)",
  "event DisputeRaised(uint256 indexed campaignId, address indexed challenger, string counterEvidenceCid)",
  "event DisputeResolved(uint256 indexed campaignId, bool upheld)",
  "event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 amount)",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error InvalidState(uint8 current, uint8 expected)",
  "error DeadlinePassed()",
  "error DeadlineNotPassed()",
  "error BudgetCeilingExceeded()",
  "error Unauthorized()",
  "error AlreadyCommitted()",
  "error InvalidCommitment()",
  "error BidExceedsBudget()",
  "error NoValidBids()",
  "error NotAnAuthorizedValidator()",
  "error AlreadyVoted()",
  "error EvidenceAlreadySubmitted()",
  "error Stage1AlreadyPaid()",
  "error ChallengePeriodActive()",
  "error DisputePending()",
  "error NoRefundDue()",
  "error TransferFailed()",
  "error InsufficientBond()",
] as const;
