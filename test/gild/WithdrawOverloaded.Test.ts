import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  assertError,
  deployERC20PriceOracleVault,
  fixedPointDiv,
  fixedPointMul,
  ADDRESS_ZERO, getEventArgs
} from "../util";
import { ERC20, ERC20PriceOracleVault } from "../../typechain";
import { BigNumber } from "ethers";
import { WithdrawEvent } from "../../typechain/IERC4626";

chai.use(solidity);

const { assert } = chai;

let vault: ERC20PriceOracleVault,
    asset: ERC20,
    price: BigNumber,
    aliceAddress: string,
    aliceAssets: BigNumber;

describe("Overloaded Withdraw", async function () {
  beforeEach(async () => {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [ERC20PriceOracleVault, Erc20Asset, priceOracle] =
        await deployERC20PriceOracleVault();

    vault = await ERC20PriceOracleVault;
    asset = await Erc20Asset;
    price = await priceOracle.price();
    aliceAddress = alice.address;

    aliceAssets = ethers.BigNumber.from(5000);
    await asset.transfer(aliceAddress, aliceAssets);

    await asset.connect(alice).increaseAllowance(vault.address, aliceAssets);

    const depositTx = await vault["deposit(uint256,address,uint256,bytes)"](
        aliceAssets,
        aliceAddress,
        price,
        []
    );

    await depositTx.wait();
  });
  it("Withdraws", async function () {
    const receiptBalance = await vault["balanceOf(address,uint256)"](
        aliceAddress,
        price
    );

    //calculate max assets available for withdraw
    const withdrawBalance = fixedPointDiv(receiptBalance, price);

    await vault["withdraw(uint256,address,address,uint256)"](
        withdrawBalance,
        aliceAddress,
        aliceAddress,
        price
    );

    const receiptBalanceAfter = await vault["balanceOf(address,uint256)"](
        aliceAddress,
        price
    );

    assert(
        receiptBalanceAfter.eq(0),
        `alice did not withdraw all 1155 receipt amounts`
    );
  });
});