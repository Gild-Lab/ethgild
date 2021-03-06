import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  assertError,
  deployERC20PriceOracleVault,
  expectedReferencePrice,
  priceOne,
  fixedPointMul,
  fixedPointDiv,
} from "../util";

chai.use(solidity);

const { assert } = chai;

describe("deposit", async function () {
  it("should not zero deposit", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[1];

    const [vault, asset] = await deployERC20PriceOracleVault();

    const totalTokenSupply = await asset.totalSupply();
    const aliceDepositAmount = totalTokenSupply.div(2);

    // give alice reserve to cover cost
    await asset.transfer(alice.address, aliceDepositAmount);

    const aliceReserveBalance = await asset.balanceOf(alice.address);

    await asset.connect(alice).approve(vault.address, aliceReserveBalance);

    await assertError(
      async () =>
        await vault["deposit(uint256,address)"](
          ethers.BigNumber.from(0),
          alice.address
        ),
      "0_ASSETS",
      "failed to prevent a zero value deposit"
    );
  });

  it("should deposit a sensible reference price", async function () {
    // At the time of writing
    // Block number: 12666285
    //
    // Trading View ETHUSD: 2218.71
    // Chainlink ETHUSD (8 decimals): 2228 25543758
    //
    // Trading View XAUUSD: 1763.95
    // Chainlink XAUUSD (8 decimals): 1767 15500000
    //
    // ~ 1 ETH should buy 1.26092812321 XAU

    const signers = await ethers.getSigners();

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const alice = signers[1];

    const totalTokenSupply = await asset.totalSupply();

    const aliceDepositAmount = totalTokenSupply.div(2);

    // give alice reserve to cover cost
    await asset.transfer(alice.address, aliceDepositAmount);

    // Min gild price MUST be respected
    const oraclePrice = await priceOracle.price();

    await asset
      .connect(alice)
      .increaseAllowance(vault.address, aliceDepositAmount);

    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["deposit(uint256,address,uint256,bytes)"](
            aliceDepositAmount,
            alice.address,
            oraclePrice.add(1),
            []
          ),
      "MIN_SHARE_RATIO",
      "failed to respect min price"
    );
    await vault
      .connect(alice)
      ["deposit(uint256,address,uint256,bytes)"](
        aliceDepositAmount,
        alice.address,
        oraclePrice,
        []
      );

    const expectedShares = oraclePrice.mul(aliceDepositAmount).div(priceOne);
    const aliceShares = await vault["balanceOf(address)"](alice.address);
    assert(
      aliceShares.eq(expectedShares),
      `wrong alice shares ${expectedShares} ${aliceShares}`
    );
  });

  it("should deposit and withdraw", async function () {
    const signers = await ethers.getSigners();

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const alice = signers[0];
    const bob = signers[1];

    const price = await priceOracle.price();
    const id1155 = price;
    assert(
      price.eq(expectedReferencePrice),
      `bad referencePrice ${price} ${expectedReferencePrice}`
    );

    let totalTokenSupply = await asset.totalSupply();

    const aliceEthAmount = totalTokenSupply.div(2);

    await asset.connect(alice).increaseAllowance(vault.address, aliceEthAmount);

    await vault
      .connect(alice)
      ["deposit(uint256,address,uint256,bytes)"](
        aliceEthAmount,
        alice.address,
        price,
        []
      );

    const expectedAliceBalance = expectedReferencePrice
      .mul(aliceEthAmount)
      .div(priceOne);
    const aliceBalance = await vault["balanceOf(address)"](alice.address);
    assert(
      aliceBalance.eq(expectedAliceBalance),
      `wrong ERC20 balance ${aliceBalance} ${expectedAliceBalance}`
    );

    const bobErc20Balance = await vault["balanceOf(address)"](bob.address);
    assert(
      bobErc20Balance.eq(0),
      `wrong bob erc20 balance ${bobErc20Balance} 0`
    );

    const erc1155Balance = await vault["balanceOf(address,uint256)"](
      alice.address,
      id1155
    );
    assert(
      erc1155Balance.eq(expectedAliceBalance),
      `wrong erc1155 balance ${erc1155Balance} ${expectedAliceBalance}`
    );

    const bobErc1155Balance = await vault["balanceOf(address,uint256)"](
      bob.address,
      id1155
    );
    assert(
      bobErc1155Balance.eq(0),
      `wrong bob erc1155 balance ${bobErc1155Balance} 0`
    );

    totalTokenSupply = await asset.totalSupply();

    const bobEthAmount = totalTokenSupply.div(3);

    await asset.transfer(bob.address, bobEthAmount);

    await asset.connect(bob).increaseAllowance(vault.address, bobEthAmount);

    await vault
      .connect(bob)
      ["deposit(uint256,address,uint256,bytes)"](
        bobEthAmount,
        bob.address,
        price,
        []
      );

    const expectedBobBalance = expectedReferencePrice
      .mul(bobEthAmount)
      .div(priceOne);
    const bobBalance = await vault["balanceOf(address)"](bob.address);
    assert(
      bobBalance.eq(expectedBobBalance),
      `wrong bob erc20 balance ${bobBalance} ${expectedBobBalance}`
    );

    const erc1155BobBalance = await vault["balanceOf(address,uint256)"](
      bob.address,
      id1155
    );
    assert(
      erc1155BobBalance.eq(expectedBobBalance),
      `wrong bob erc1155 balance ${erc1155BobBalance} ${expectedBobBalance}`
    );

    await vault
      .connect(alice)
      ["redeem(uint256,address,address,uint256)"](
        erc1155Balance,
        alice.address,
        alice.address,
        price
      );
    const erc20AliceBalanceWithdraw = await vault["balanceOf(address)"](
      alice.address
    );

    assert(
      erc20AliceBalanceWithdraw.eq(0),
      `wrong alice erc20 balance after ungild ${erc20AliceBalanceWithdraw} 0`
    );

    // alice cannot withdraw a different referencePrice deposit.
    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["redeem(uint256,address,address,uint256)"](
            erc1155Balance.sub(1),
            alice.address,
            alice.address,
            price
          ),
      "burn amount exceeds balance",
      "failed to prevent gild referencePrice manipulation"
    );

    const erc1155AliceBalanceUngild = await vault["balanceOf(address,uint256)"](
      alice.address,
      id1155
    );
    assert(
      erc1155AliceBalanceUngild.eq(0),
      `wrong alice erc1155 balance after ungild ${erc1155AliceBalanceUngild} 0`
    );
  });

  it("should trade erc1155", async function () {
    const signers = await ethers.getSigners();

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const alice = signers[0];
    const bob = signers[1];

    const aliceVault = vault.connect(alice);
    const bobVault = vault.connect(bob);

    const price = await priceOracle.price();
    const id1155 = price;

    let totalTokenSupply = await asset.totalSupply();

    const aliceAssetBalanceAmount = totalTokenSupply.div(2);

    await asset.transfer(alice.address, aliceAssetBalanceAmount);

    await asset
      .connect(alice)
      .increaseAllowance(vault.address, aliceAssetBalanceAmount);

    await aliceVault["deposit(uint256,address)"](
      aliceAssetBalanceAmount,
      alice.address
    );

    const aliceShareBalance = await vault["balanceOf(address)"](alice.address);

    const expectedAliceShareBalance = fixedPointMul(
      price,
      aliceAssetBalanceAmount
    );
    assert(
      expectedAliceShareBalance.eq(aliceShareBalance),
      `wrong alice share balance`
    );

    // transfer all receipt from alice to bob.
    await aliceVault.safeTransferFrom(
      alice.address,
      bob.address,
      id1155,
      aliceShareBalance,
      []
    );

    // alice cannot withdraw after sending to bob.
    await assertError(
      async () =>
        await aliceVault["redeem(uint256,address,address,uint256)"](
          1000,
          alice.address,
          alice.address,
          price
        ),
      "burn amount exceeds balance",
      "failed to prevent alice withdrawing after sending erc1155"
    );

    // bob cannot withdraw without erc20
    await assertError(
      async () =>
        await bobVault["redeem(uint256,address,address,uint256)"](
          1000,
          bob.address,
          bob.address,
          price
        ),
      "burn amount exceeds balance",
      "failed to prevent bob withdrawing without receiving erc20"
    );

    // erc20 transfer all of alice's shares to bob.
    await aliceVault.transfer(bob.address, aliceShareBalance);

    await assertError(
      async () =>
        await aliceVault["redeem(uint256,address,address,uint256)"](
          1000,
          alice.address,
          alice.address,
          price
        ),
      "burn amount exceeds balance",
      "failed to prevent alice withdrawing after sending erc1155 and erc20"
    );

    // bob can redeem now
    const bobAssetBalanceBefore = await asset.balanceOf(bob.address);
    const bobReceiptBalance = await vault["balanceOf(address,uint256)"](
      bob.address,
      id1155
    );

    const bobRedeemTx = await bobVault[
      "redeem(uint256,address,address,uint256)"
    ](bobReceiptBalance, bob.address, bob.address, price);
    await bobRedeemTx.wait();
    const bobReceiptBalanceAfter = await vault["balanceOf(address,uint256)"](
      bob.address,
      id1155
    );
    const bobAssetBalanceAfter = await asset.balanceOf(bob.address);
    assert(
      bobReceiptBalanceAfter.eq(0),
      `bob did not redeem all 1155 receipt amounts`
    );

    const bobAssetBalanceDiff = bobAssetBalanceAfter.sub(bobAssetBalanceBefore);
    // Bob should be able to withdraw what alice deposited.
    const bobAssetBalanceDiffExpected = fixedPointDiv(aliceShareBalance, price);
    assert(
      bobAssetBalanceDiff.eq(bobAssetBalanceDiffExpected),
      `wrong bob asset diff ${bobAssetBalanceDiffExpected} ${bobAssetBalanceDiff}`
    );
  });
});
