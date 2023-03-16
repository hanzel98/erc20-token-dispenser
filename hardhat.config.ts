import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

import "@nomiclabs/hardhat-etherscan";

import "hardhat-dependency-compiler";

import "@nomiclabs/hardhat-ethers";

import * as dotenv from "dotenv";

import "solidity-coverage";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
    ],
  },

  defaultNetwork: "hardhat",
  networks: {
    goerli: {
      url:
        String((process.env.ETHEREUM_GOERLI_RPC || "https://eth-goerli.g.alchemy.com/v2/").trim()) +
        String(process.env.ALCHEMY_API_KEY?.trim()),
      chainId: 5,
      accounts: [(process.env.PRIVATE_KEY || "").trim()],
      timeout: 86400000,
      gasPrice: 5000000000,
    },
  },

  etherscan: {
    apiKey: {
      goerli: (process.env.ETHERSCAN_API_KEY || "").trim(),
    },
  },

  mocha: {
    timeout: 100_000_000,
  },
};

export default config;
