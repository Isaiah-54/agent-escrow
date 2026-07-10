const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const bal = await hre.ethers.provider.getBalance(signer.address);
  console.log("Address:", signer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "OKB");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
