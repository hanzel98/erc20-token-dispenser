import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { ethers } from "hardhat";

import { expect } from "chai";

const { parseEther: toWei } = ethers.utils;
const toBN = (num: any) => BigNumber.from(num);

describe("TokenDispenser", () => {
  let deployer: SignerWithAddress;
  let receiver: SignerWithAddress;

  let MockedErc20: ContractFactory;
  let TokenDispenser: ContractFactory;

  let token: Contract;
  let tokenDispenser: Contract;
  let totalBalance: BigNumber;
  let dispenserDeploymentTimestamp: number;

  const monthlyMin = toWei("100");
  const monthlyMax = toWei("10000");

  beforeEach(async () => {
    [deployer, receiver] = await ethers.getSigners();

    MockedErc20 = await ethers.getContractFactory("MockERC20");
    TokenDispenser = await ethers.getContractFactory("TokenDispenser");

    token = await MockedErc20.deploy(deployer.address);
    tokenDispenser = await TokenDispenser.deploy(token.address, monthlyMin, monthlyMax, receiver.address);

    dispenserDeploymentTimestamp = (await ethers.provider.getBlock(tokenDispenser.blockNumber)).timestamp;

    totalBalance = await token.balanceOf(deployer.address);

    token.transfer(tokenDispenser.address, totalBalance);
  });

  describe("should initialize the state", () => {
    it("should initialize the token", async () => {
      const obtainedValue = await tokenDispenser.token();
      expect(obtainedValue).to.equal(token.address);
    });

    it("should initialize the monthlyMin", async () => {
      const obtainedValue = await tokenDispenser.monthlyMin();
      expect(obtainedValue).to.equal(monthlyMin);
    });

    it("should initialize the monthlyMax", async () => {
      const obtainedValue = await tokenDispenser.monthlyMax();
      expect(obtainedValue).to.equal(monthlyMax);
    });

    it("should initialize the receiver", async () => {
      const obtainedValue = await tokenDispenser.receiver();
      expect(obtainedValue).to.equal(receiver.address);
    });

    it("should initialize the start", async () => {
      const obtainedValue = await tokenDispenser.start();
      expect(obtainedValue).to.equal(dispenserDeploymentTimestamp);
    });

    it("should initialize the lastClaimedPeriodStartTime", async () => {
      const obtainedValue = await tokenDispenser.lastClaimedPeriodStartTime();
      expect(obtainedValue).to.equal(dispenserDeploymentTimestamp);
    });

    it("should have enough balance", async () => {
      const dispenserBalance = await token.balanceOf(tokenDispenser.address);
      expect(dispenserBalance).to.equal(totalBalance);
      const isGreaterThanZero = dispenserBalance.gt(0);
      expect(isGreaterThanZero).to.equal(true);
    });
  });

  describe("should distribute the tokens correctly", () => {});
});
