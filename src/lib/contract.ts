import { ethers } from "ethers";

// Minimal ABI — only the functions/events our backend actually needs to call or read.
const AGENT_ESCROW_ABI = [
  "function submitVerdict(uint256 escrowId, bool passed, string reason) external",
  "function getEscrow(uint256 escrowId) external view returns (tuple(address creator, address worker, uint256 amount, string taskDescription, string successCriteria, string resultURI, uint8 status))",
  "event VerdictSubmitted(uint256 indexed escrowId, bool passed, string reason)",
  "event PaymentReleased(uint256 indexed escrowId, address indexed worker, uint256 amount, uint256 fee)",
  "event Refunded(uint256 indexed escrowId, address indexed creator, uint256 amount)",
];

const RPC_URL = "https://testrpc.xlayer.tech/terigon";

export function getVerifierContract() {
  const privateKey = process.env.PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!privateKey) throw new Error("PRIVATE_KEY missing from .env");
  if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing from .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(contractAddress, AGENT_ESCROW_ABI, wallet);
}
