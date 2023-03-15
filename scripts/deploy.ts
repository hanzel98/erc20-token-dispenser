import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  //   const currentTimestampInSeconds = Math.round(Date.now() / 1000);

  const MockedErc20 = await ethers.getContractFactory("MockERC20");
  const mockedErc20 = await MockedErc20.deploy();

  await mockedErc20.deployed();

  console.log(`Erc20 deployed to ${mockedErc20.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
