import hre, { ethers, run } from "hardhat";
const { parseEther: toWei } = ethers.utils;
const { getSigners } = ethers;
const WAIT_BLOCK_CONFIRMATIONS = 7;

async function main() {
  const [deployer] = await getSigners();

  const monthlyMin = toWei("100");
  const monthlyMax = toWei("10000");
  const receiver = "0x15023b342BB80f6927e4F61734487572a5323836";

  // Deployment of ERC20 token
  console.log("Deploying the ERC20 token contract...");
  const MockedErc20 = await ethers.getContractFactory("MockERC20");
  const token = await MockedErc20.deploy(deployer.address);
  await token.deployTransaction.wait(WAIT_BLOCK_CONFIRMATIONS);

  console.log("The ERC20 token address is: ", token.address);

  // Deployment of TokenDispenser
  console.log("Deploying the TokenDispenser contract...");
  const TokenDispenser = await ethers.getContractFactory("TokenDispenser");
  const tokenDispenser = await TokenDispenser.deploy(token.address, monthlyMin, monthlyMax, receiver);
  await tokenDispenser.deployTransaction.wait(WAIT_BLOCK_CONFIRMATIONS);

  console.log("The TokenDispenser address is: ", tokenDispenser.address);

  // Funding the dispenser with tokens
  console.log("Funding the TokenDispenser contract with tokens...");
  const totalBalance = await token.balanceOf(deployer.address);
  await token.transfer(tokenDispenser.address, totalBalance);

  console.log(`Verifying contract on Etherscan...`);

  try {
    await run(`verify:verify`, {
      address: token.address,
      contract: "contracts/MockERC20.sol:MockERC20",
      constructorArguments: [deployer.address],
    });
  } catch (error) {
    console.error("Error while verifying the token: ", error);
  }

  try {
    await run(`verify:verify`, {
      address: tokenDispenser.address,
      constructorArguments: [token.address, monthlyMin, monthlyMax, receiver],
    });
  } catch (error) {
    console.error("Error while verifying the tokenDispenser: ", error);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
