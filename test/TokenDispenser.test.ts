import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { increaseTime as increaseTimeHelper } from "./helpers/increaseTime";
import { getPreviousBlockTimestamp, getBlockTimestamp } from "./helpers/getBlockTimestamp";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Times } from "./types/types";

const { parseEther: toWei } = ethers.utils;
const { provider, getSigners, constants } = ethers;

const toBN = (num: any) => BigNumber.from(num);
const increaseTime = (time: number) => increaseTimeHelper(provider, time);

const monthlyMin = toWei("100");
const monthlyMax = toWei("10000");
const oneYear = 31536000; // In seconds
const oneMonth = toBN(oneYear / 12);

let deployer: SignerWithAddress;
let receiver: SignerWithAddress;
let randomUser: SignerWithAddress;

let MockedErc20: ContractFactory;
let TokenDispenser: ContractFactory;

let token: Contract;
let tokenDispenser: Contract;
let totalBalance: BigNumber;
let dispenserDeploymentTimestamp: BigNumber;

describe("TokenDispenser", () => {
  beforeEach(async () => {
    await hre.network.provider.send("hardhat_reset");

    [deployer, receiver, randomUser] = await getSigners();

    MockedErc20 = await ethers.getContractFactory("MockERC20");
    TokenDispenser = await ethers.getContractFactory("TokenDispenser");

    token = await MockedErc20.deploy(deployer.address);
    tokenDispenser = await TokenDispenser.deploy(token.address, monthlyMin, monthlyMax, receiver.address);

    dispenserDeploymentTimestamp = await getBlockTimestamp(tokenDispenser.blockNumber);

    console.log("dispenserDeploymentTimestamp:", dispenserDeploymentTimestamp.toString());

    totalBalance = await token.balanceOf(deployer.address);

    token.transfer(tokenDispenser.address, totalBalance);

    toBN(122).div(toBN(oneYear).div(12));
  });

  describe.skip("should verify deployment inputs", () => {
    it("should fail with an invalid token", async () => {
      await expect(
        TokenDispenser.deploy(constants.AddressZero, monthlyMin, monthlyMax, receiver.address)
      ).to.be.revertedWithCustomError(tokenDispenser, "InvalidToken");
    });

    it("should fail with an invalid monthlyMax", async () => {
      await expect(TokenDispenser.deploy(token.address, monthlyMin, 0, receiver.address)).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidMontlyMax"
      );
    });

    it("should fail with an invalid receiver", async () => {
      await expect(
        TokenDispenser.deploy(token.address, monthlyMin, monthlyMax, constants.AddressZero)
      ).to.be.revertedWithCustomError(tokenDispenser, "InvalidReceiver");
    });
  });

  describe.skip("should initialize the state", () => {
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

    it("should get the contract balance", async () => {
      const dispenserBalance = await token.balanceOf(tokenDispenser.address);

      const obtainedValue = await tokenDispenser.getContractBalance();
      expect(obtainedValue).to.equal(dispenserBalance);
    });
  });

  describe("should distribute the tokens correctly", () => {
    it("should not allow an invalid user to claim", async () => {
      await expect(tokenDispenser.connect(randomUser).claim(toWei("1"))).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidClaimCaller"
      );
    });

    it("should not allow the owner to claim", async () => {
      await expect(tokenDispenser.connect(deployer).claim(toWei("1"))).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidClaimCaller"
      );
    });

    it("should validate the elapsed years after deployment", async () => {
      const [elapsedYears] = await tokenDispenser.getTimes();
      expect(elapsedYears).to.equal(0);
    });

    it("should validate the elapsedYears after 50 years", async () => {
      for (let i = 0; i < 101; i++) {
        const [elapsedYears] = await tokenDispenser.getTimes();
        expect(elapsedYears).to.equal(i);
        await increaseTime(oneYear);
      }
    });

    it("should validate the claimable month after 50 months", async () => {
      for (let i = 1; i < 51; i++) {
        const [, claimableMonth] = await tokenDispenser.getTimes();
        expect(claimableMonth).to.equal(i);
        await increaseTime(oneMonth.toNumber());
      }
    });

    it("should validate the estimated claimable", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      const estimatedClaimable = await calculateClaimableAmount();
      expect(maxTokens).to.equal(estimatedClaimable);
      // TODO: DELETE this
      expect(maxTokens).to.equal(toWei("1000")); // 10 % first year
    });

    it("should allow claiming immediately after deployment", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      const estimatedClaimable = await calculateClaimableAmount();

      const balanceBefore = await getBalance(receiver);
      await tokenDispenser.connect(receiver).claim(maxTokens);
      const balanceAfter = await getBalance(receiver);

      expect(balanceBefore).to.equal(0);
      expect(balanceAfter).to.equal(maxTokens);
      expect(balanceAfter).to.equal(estimatedClaimable);
    });

    it.only("should allow claiming every month until monthlyMin reached", async () => {
      let totalExpected = toBN(0);
      while (true) {
        const cbalance = await tokenDispenser.getContractBalance();
        console.log("cbalance:", cbalance.toString());
        if (cbalance.eq(0)) break;
        const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
        const estimatedClaimable = await estimateMaxTokensOfMonth();
        console.log("+++++++++++++++++++ maxTokens:", maxTokens.div(toWei("1")).toString());
        expect(maxTokens).to.equal(estimatedClaimable);
        await tokenDispenser.connect(receiver).claim(maxTokens);
        // console.log("===cbalance:", cbalance.div(toWei("1")).toString());
        totalExpected = totalExpected.add(maxTokens);
        const balanceAfter = await getBalance(receiver);
        expect(balanceAfter).to.equal(totalExpected);
        await increaseTime(oneMonth.toNumber());
      }

      // const balanceBefore = await getBalance(receiver);
      // await tokenDispenser.connect(receiver).claim(maxTokens);
      // const balanceAfter = await getBalance(receiver);

      // expect(balanceBefore).to.equal(0);
      // expect(balanceAfter).to.equal(maxTokens);
      // expect(balanceAfter).to.equal(estimatedClaimable);
    });

    it("should change isNewMonth after claiming on the same month", async () => {
      const [maxTokens, isNewMonthBefore] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthBefore).to.equal(true);
      await tokenDispenser.connect(receiver).claim(maxTokens);
      const [, isNewMonthAfter] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthAfter).to.equal(false);
    });

    it("should change isNewMonth back to true after 1 month of the last claim", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      await tokenDispenser.connect(receiver).claim(maxTokens);
      const [, isNewMonthBefore] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthBefore).to.equal(false);
      await increaseTime(oneMonth.toNumber());
      const [, isNewMonthAfter] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthAfter).to.equal(true);
    });
  });
});

async function getBalance(signer: SignerWithAddress): Promise<BigNumber> {
  return await token.balanceOf(signer.address);
}

async function estimateTimes(): Promise<Times> {
  const blockTimestamp = await getPreviousBlockTimestamp();
  const elapsedTime = blockTimestamp.sub(dispenserDeploymentTimestamp);
  const currentYear = elapsedTime.div(oneYear).add(1);
  let claimableMonth = elapsedTime.div(oneMonth).add(1);
  // if (claimableMonth.eq(0)) claimableMonth = toBN(1);
  const newPeriodStartTime = dispenserDeploymentTimestamp.add(claimableMonth.mul(oneMonth));
  return { currentYear, claimableMonth, newPeriodStartTime };
}

async function calculateClaimableAmount(): Promise<BigNumber> {
  const yearNumber = (await estimateTimes()).currentYear;

  if (yearNumber.eq(1)) return monthlyMax.div(10); // 10%
  if (yearNumber.eq(2)) return monthlyMax.div(2 ** 2); // 25%
  if (yearNumber.eq(3)) return monthlyMax.div(2 ** 1); // 50%
  if (yearNumber.eq(4)) return monthlyMax; // 100%

  const modulo4IsZero = yearNumber.mod(4).eq(0);
  const exponential = modulo4IsZero ? yearNumber.div(4).sub(1) : yearNumber.div(4);
  return monthlyMax.div(toBN(2).pow(exponential));
}

async function estimateMaxTokensOfMonth(): Promise<BigNumber> {
  let amount = await calculateClaimableAmount();
  if (amount.lte(monthlyMin)) {
    amount = await tokenDispenser.getContractBalance();
  }
  let maxTokens: BigNumber;
  const times: Times = await estimateTimes();
  const lastClaimedPeriodStartTime = await tokenDispenser.lastClaimedPeriodStartTime();
  const claimedThisMonth = await tokenDispenser.claimedThisMonth();
  const isNewMonth = times.newPeriodStartTime.gt(lastClaimedPeriodStartTime);
  if (isNewMonth) maxTokens = amount;
  else maxTokens = amount.sub(claimedThisMonth);
  return maxTokens;
}
