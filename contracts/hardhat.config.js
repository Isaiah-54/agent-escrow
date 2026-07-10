require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    xlayerTestnet: {
      url: "https://testrpc.xlayer.tech/terigon",
      chainId: 1952,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
