const hre = require("hardhat");
require("dotenv").config({ path: "../.env" });

async function checkBalance(label, privateKey) {
  const provider = new hre.ethers.JsonRpcProvider("https://testrpc.xlayer.tech/terigon");
  const wallet = new hre.ethers.Wallet(privateKey, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log(`${label}: ${wallet.address} — ${hre.ethers.formatEther(bal)} OKB`);
}

async function main() {
  await checkBalance("Verifier ", process.env.PRIVATE_KEY);
  await checkBalance("Creator  ", process.env.CREATOR_PRIVATE_KEY);
  await checkBalance("Worker   ", process.env.WORKER_PRIVATE_KEY);
}

main();
