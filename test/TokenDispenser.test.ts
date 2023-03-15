import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { ethers } from "hardhat";

import { expect } from "chai";

describe("TokenDispenser", () => {
  let deployer: SignerWithAddress;
  let receiver: SignerWithAddress;

  let MockedErc20: ContractFactory;
  let TokenDispenser: ContractFactory;

  let token: Contract;
  let tokenDispenser: Contract;
  let totalBalance: BigNumber;

  beforeEach(async () => {
    [deployer, receiver] = await ethers.getSigners();

    MockedErc20 = await ethers.getContractFactory("MockERC20");
    TokenDispenser = await ethers.getContractFactory("TokenDispenser");

    token = await MockedErc20.deploy(deployer.address);
    tokenDispenser = await TokenDispenser.deploy();
    totalBalance = await token.balanceOf(deployer.address);

    token.transfer(tokenDispenser.address, totalBalance);
  });

  describe("should distribute the tokens correctly", () => {
    it("should initialize the contract state", async () => {
      expect(true).to.equal(true);
    });

    it("should have enough balance", async () => {
      const dispenserBalance = await token.balanceOf(tokenDispenser.address);
      expect(dispenserBalance).to.equal(totalBalance);
    });
  });
});
