import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { increaseTime as increaseTimeHelper } from "./helpers/increaseTime";
import { getPreviousBlockTimestamp, getBlockTimestamp } from "./helpers/getBlockTimestamp";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { expect } from "chai";
import hre, { ethers, artifacts } from "hardhat";
import { deployMockContract, MockContract } from "ethereum-waffle";

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

    totalBalance = await token.balanceOf(deployer.address);

    token.transfer(tokenDispenser.address, totalBalance);
  });

  describe("Should verify deployment inputs", () => {
    it("Should fail with an invalid token", async () => {
      await expect(
        TokenDispenser.deploy(constants.AddressZero, monthlyMin, monthlyMax, receiver.address)
      ).to.be.revertedWithCustomError(tokenDispenser, "InvalidToken");
    });

    it("Should fail with an invalid monthlyMax", async () => {
      await expect(TokenDispenser.deploy(token.address, monthlyMin, 0, receiver.address)).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidMontlyMax"
      );
    });

    it("Should fail with an invalid receiver", async () => {
      await expect(
        TokenDispenser.deploy(token.address, monthlyMin, monthlyMax, constants.AddressZero)
      ).to.be.revertedWithCustomError(tokenDispenser, "InvalidReceiver");
    });
  });

  describe("Should validate changes in the receiver", () => {
    it("Should fail to change the receiver when using an invalid owner", async () => {
      await expect(tokenDispenser.connect(randomUser).changeReceiver(randomUser.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should fail to change the receiver with a zero receiver", async () => {
      await expect(
        tokenDispenser.connect(deployer).changeReceiver(constants.AddressZero)
      ).to.be.revertedWithCustomError(tokenDispenser, "InvalidReceiver");
    });

    it("Should allow the owner to change the receiver", async () => {
      const receiverBefore = await tokenDispenser.receiver();
      const newReceiver = randomUser.address;
      await tokenDispenser.connect(deployer).changeReceiver(newReceiver);
      const receiverAfter = await tokenDispenser.receiver();
      expect(receiverBefore).to.not.equal(receiverAfter);
      expect(receiverAfter).to.equal(newReceiver);
    });

    it("Should emit an event after changin the receiver", async () => {
      const newReceiver = randomUser.address;
      await expect(await tokenDispenser.connect(deployer).changeReceiver(newReceiver)).to.emit(
        tokenDispenser,
        "ReceiverChanged"
      );
    });
  });

  describe("Should initialize the state", () => {
    it("Should initialize the token", async () => {
      const obtainedValue = await tokenDispenser.token();
      expect(obtainedValue).to.equal(token.address);
    });

    it("Should initialize the monthlyMin", async () => {
      const obtainedValue = await tokenDispenser.monthlyMin();
      expect(obtainedValue).to.equal(monthlyMin);
    });

    it("Should initialize the monthlyMax", async () => {
      const obtainedValue = await tokenDispenser.monthlyMax();
      expect(obtainedValue).to.equal(monthlyMax);
    });

    it("Should initialize the receiver", async () => {
      const obtainedValue = await tokenDispenser.receiver();
      expect(obtainedValue).to.equal(receiver.address);
    });

    it("Should initialize the start", async () => {
      const obtainedValue = await tokenDispenser.start();
      expect(obtainedValue).to.equal(dispenserDeploymentTimestamp);
    });

    it("Should initialize the lastClaimedPeriodStartTime", async () => {
      const obtainedValue = await tokenDispenser.lastClaimedPeriodStartTime();
      expect(obtainedValue).to.equal(dispenserDeploymentTimestamp);
    });

    it("Should have enough balance", async () => {
      const dispenserBalance = await token.balanceOf(tokenDispenser.address);
      expect(dispenserBalance).to.equal(totalBalance);
      const isGreaterThanZero = dispenserBalance.gt(0);
      expect(isGreaterThanZero).to.equal(true);
    });

    it("Should get the contract balance", async () => {
      const dispenserBalance = await token.balanceOf(tokenDispenser.address);

      const obtainedValue = await tokenDispenser.getContractBalance();
      expect(obtainedValue).to.equal(dispenserBalance);
    });
  });

  describe("Should distribute the tokens correctly", () => {
    it("Should not allow an invalid user to claim", async () => {
      await expect(tokenDispenser.connect(randomUser).claim(toWei("1"))).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidClaimCaller"
      );
    });

    it("Should not allow the owner to claim", async () => {
      await expect(tokenDispenser.connect(deployer).claim(toWei("1"))).to.be.revertedWithCustomError(
        tokenDispenser,
        "InvalidClaimCaller"
      );
    });

    it("Should not allow to claim more than estimaded claimable", async () => {
      const estimatedClaimable = await calculateClaimableAmount();
      await expect(tokenDispenser.connect(receiver).claim(estimatedClaimable.add(1))).to.be.revertedWithCustomError(
        tokenDispenser,
        "MonthlyClaimTooHigh"
      );
    });

    it("Should throw an error if transfer returns false", async () => {
      const TokenDispenserArt = await artifacts.readArtifact("IERC20");
      const tokenMock = await deployMockContract(deployer, TokenDispenserArt.abi);
      const tokenDispenser2 = await TokenDispenser.deploy(tokenMock.address, monthlyMin, monthlyMax, receiver.address);
      await tokenMock.mock.balanceOf.returns(toWei("10000"));
      await tokenMock.mock.transfer.returns(false);
      await expect(tokenDispenser2.connect(receiver).claim("100")).to.be.revertedWithCustomError(
        tokenDispenser2,
        "PaymentFailed"
      );
    });

    it("Should validate the current year after deployment", async () => {
      const [currentYear] = await tokenDispenser.getTimes();
      expect(currentYear).to.equal(1);
    });

    it("Should validate the currentYear after 50 years", async () => {
      for (let i = 1; i < 50; i++) {
        const [currentYear] = await tokenDispenser.getTimes();
        expect(currentYear).to.equal(i);
        await increaseTime(oneYear);
      }
    });

    it("Should validate the current month after 50 months", async () => {
      for (let i = 1; i < 51; i++) {
        const [, currentMonth] = await tokenDispenser.getTimes();
        expect(currentMonth).to.equal(i);
        await increaseTime(oneMonth.toNumber());
      }
    });

    it("Should validate the estimated claimable", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      const estimatedClaimable = await calculateClaimableAmount();
      expect(maxTokens).to.equal(estimatedClaimable);
      expect(maxTokens).to.equal(toWei("1000")); // 10 % first year
    });

    it("Should allow claiming immediately after deployment", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      const estimatedClaimable = await calculateClaimableAmount();

      const balanceBefore = await getBalance(receiver.address);
      await tokenDispenser.connect(receiver).claim(maxTokens);
      const balanceAfter = await getBalance(receiver.address);
      expect(balanceBefore).to.equal(0);
      expect(balanceAfter).to.equal(maxTokens);
      expect(balanceAfter).to.equal(estimatedClaimable);
    });

    it("Should allow partial claiming", async () => {
      const [maxTokens1] = await tokenDispenser.calculateMaxTokensThisMonth();
      const balanceBefore = await getBalance(receiver.address);
      expect(balanceBefore).to.equal(0);
      await tokenDispenser.connect(receiver).claim(maxTokens1.div(2));
      const balanceAfter1 = await getBalance(receiver.address);
      expect(balanceAfter1).to.equal(maxTokens1.div(2));

      const [maxTokens2] = await tokenDispenser.calculateMaxTokensThisMonth();
      await tokenDispenser.connect(receiver).claim(maxTokens2);
      const balanceAfter2 = await getBalance(receiver.address);
      expect(balanceAfter2).to.equal(maxTokens1.div(2).add(maxTokens2));

      const [maxTokens3] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(tokenDispenser.connect(receiver).claim(maxTokens3)).to.be.revertedWithCustomError(
        tokenDispenser,
        "ClaimingZero"
      );
    });

    it("Should emit an event after the claim", async () => {
      const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
      await expect(await tokenDispenser.connect(receiver).claim(maxTokens))
        .to.emit(tokenDispenser, "Claimed")
        .withArgs(maxTokens);
    });

    it.skip("Should allow claiming every month until monthlyMin reached", async () => {
      // Heavy test
      // This test will claim the tokens every month until the contract's balance is drained.
      let totalExpected = toBN(0);
      while (true) {
        const cbalance = await tokenDispenser.getContractBalance();
        if (cbalance.eq(0)) break;
        const [maxTokens] = await tokenDispenser.calculateMaxTokensThisMonth();
        const estimatedClaimable = await estimateMaxTokensOfMonth();
        expect(maxTokens).to.equal(estimatedClaimable);
        await tokenDispenser.connect(receiver).claim(maxTokens);
        totalExpected = totalExpected.add(maxTokens);
        const balanceAfter = await getBalance(receiver.address);
        expect(balanceAfter).to.equal(totalExpected);
        await increaseTime(oneMonth.toNumber());
      }
      const finalReceiverBalance = await getBalance(receiver.address);
      expect(finalReceiverBalance).to.equal(totalBalance);
      const finalContractBalance = await getBalance(tokenDispenser.address);
      expect(finalContractBalance).to.equal(0);

      await expect(tokenDispenser.connect(receiver).claim("1")).to.be.revertedWithCustomError(
        tokenDispenser,
        "NoTokensLeftToDistribute"
      );
    });

    it("Should change isNewMonth after claiming on the same month", async () => {
      const [maxTokens, isNewMonthBefore] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthBefore).to.equal(true);
      await tokenDispenser.connect(receiver).claim(maxTokens);
      const [, isNewMonthAfter] = await tokenDispenser.calculateMaxTokensThisMonth();
      expect(isNewMonthAfter).to.equal(false);
    });

    it("Should change isNewMonth back to true after 1 month of the last claim", async () => {
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

async function getBalance(address: string): Promise<BigNumber> {
  return await token.balanceOf(address);
}

async function estimateTimes(): Promise<Times> {
  const blockTimestamp = await getPreviousBlockTimestamp();
  const elapsedTime = blockTimestamp.sub(dispenserDeploymentTimestamp);
  const currentYear = elapsedTime.div(oneYear).add(1);
  let currentMonth = elapsedTime.div(oneMonth).add(1);
  const newPeriodStartTime = dispenserDeploymentTimestamp.add(currentMonth.mul(oneMonth));
  return { currentYear, currentMonth, newPeriodStartTime };
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
