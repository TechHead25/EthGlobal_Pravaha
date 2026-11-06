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
