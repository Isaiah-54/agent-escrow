const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "OKB");

  const AgentEscrow = await hre.ethers.getContractFactory("AgentEscrow");
  // Deployer wallet also acts as the AI verifier for the MVP
  const contract = await AgentEscrow.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AgentEscrow deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
