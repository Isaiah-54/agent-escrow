import { ethers } from "ethers";

// Minimal ABI — only the functions/events our backend actually needs to call or read.
const AGENT_ESCROW_ABI = [
  "function createAndFundEscrow(string taskDescription, string successCriteria) external payable returns (uint256)",
  "function acceptTask(uint256 escrowId) external",
  "function submitResult(uint256 escrowId, string resultURI) external",
  "function submitVerdict(uint256 escrowId, bool passed, string reason) external",
  "function getEscrow(uint256 escrowId) external view returns (tuple(address creator, address worker, uint256 amount, string taskDescription, string successCriteria, string resultURI, uint8 status))",
  "event EscrowCreated(uint256 indexed escrowId, address indexed creator, string taskDescription, string successCriteria)",
  "event TaskAccepted(uint256 indexed escrowId, address indexed worker)",
  "event ResultSubmitted(uint256 indexed escrowId, string resultURI)",
  "event VerdictSubmitted(uint256 indexed escrowId, bool passed, string reason)",
  "event PaymentReleased(uint256 indexed escrowId, address indexed worker, uint256 amount, uint256 fee)",
  "event Refunded(uint256 indexed escrowId, address indexed creator, uint256 amount)",
];

const RPC_URL = "https://rpc.xlayer.tech";

function getWalletContract(privateKey: string) {
  if (!privateKey) throw new Error("Missing private key for this agent wallet");
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing from .env");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(contractAddress, AGENT_ESCROW_ABI, wallet);
}

export function getVerifierContract() {
  return getWalletContract(process.env.PRIVATE_KEY!);
}
export function getCreatorContract() {
  return getWalletContract(process.env.CREATOR_PRIVATE_KEY!);
}
export function getWorkerContract() {
  return getWalletContract(process.env.WORKER_PRIVATE_KEY!);
}

// Pulls the numeric escrowId out of the EscrowCreated event in a transaction receipt.
export function parseEscrowIdFromReceipt(receipt: ethers.ContractTransactionReceipt, contract: ethers.Contract): string {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "EscrowCreated") {
        return parsed.args.escrowId.toString();
      }
    } catch {
      // not a log from this contract's ABI, skip
    }
  }
  throw new Error("EscrowCreated event not found in transaction receipt");
}
