import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import {
  assertError,
  deployERC20PriceOracleVault,
  fixedPointDiv,
  fixedPointMul,
  expectedReferencePrice,
  ADDRESS_ZERO,
} from "../util";

chai.use(solidity);

const { assert } = chai;

describe("Mint", async function () {
  it("Sets maxShares correctly", async function () {
    const signers = await ethers.getSigners();
    const owner = signers[0];

    const [vault] = await deployERC20PriceOracleVault();

    const expectedMaxShares = ethers.BigNumber.from(2)
      .pow(256)
      //up to 2**256 so should substruct 1
      .sub(1);
    const maxShares = await vault.maxMint(owner.address);

    assert(
      maxShares.eq(expectedMaxShares),
      `Wrong max deposit ${expectedMaxShares} ${maxShares}`
    );
  });
  it("Checks min share ratio is less than share ratio", async function () {
    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();
    const shareRatio = await priceOracle.price();

    const signers = await ethers.getSigners();
    const alice = signers[0];

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const shares = fixedPointMul(assets, shareRatio);

    await vault.connect(alice).setMinShareRatio(shareRatio.add(1));

    await assertError(
      async () => await vault.previewMint(shares),
      "MIN_SHARE_RATIO",
      "failed to respect min shareRatio"
    );
  });
  it("PreviewMint - Calculates assets correctly with round up", async function () {
    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();
    const shareRatio = await priceOracle.price();

    assert(
      shareRatio.eq(expectedReferencePrice),
      `Incorrect shareRatio ${shareRatio} ${expectedReferencePrice}`
    );

    const shares = ethers.BigNumber.from("10").pow(20);
    const expectedAssets = fixedPointDiv(shares, shareRatio).add(1);

    const assets = await vault.previewMint(shares);

    assert(
      assets.eq(expectedAssets),
      `Wrong max deposit ${expectedAssets} ${assets}`
    );
  });
  it("Mint - Calculates assets correctly while minShareRation is set", async function () {
    const signers = await ethers.getSigners();

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const alice = signers[0];

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const aliceBalanceBefore = await asset.balanceOf(alice.address);

    const shareRatio = await priceOracle.price();

    const shares = fixedPointMul(assets, shareRatio);
    //set minShareRatio
    await vault.setMinShareRatio(shareRatio.sub(1));

    await vault.connect(alice)["mint(uint256,address)"](shares, alice.address);

    const expectedAssets = fixedPointDiv(shares, shareRatio).add(1);

    const aliceBalanceAfter = await asset.balanceOf(alice.address);
    const aliceBalanceDiff = aliceBalanceBefore.sub(aliceBalanceAfter);

    assert(
      aliceBalanceDiff.eq(expectedAssets),
      `wrong alice assets ${expectedAssets} ${aliceBalanceDiff}`
    );
  });
  it("Mint - Calculates assets correctly", async function () {
    const signers = await ethers.getSigners();

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const alice = signers[0];

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const aliceBalanceBefore = await asset.balanceOf(alice.address);

    const shareRatio = await priceOracle.price();

    const shares = fixedPointMul(assets, shareRatio);

    await vault.connect(alice)["mint(uint256,address)"](shares, alice.address);

    const expectedAssets = fixedPointDiv(shares, shareRatio).add(1);

    const aliceBalanceAfter = await asset.balanceOf(alice.address);
    const aliceBalanceDiff = aliceBalanceBefore.sub(aliceBalanceAfter);

    assert(
      aliceBalanceDiff.eq(expectedAssets),
      `wrong alice assets ${expectedAssets} ${aliceBalanceDiff}`
    );
  });
  it("Should not mint to 0 shares", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [vault] = await deployERC20PriceOracleVault();
    const shares = ethers.BigNumber.from(0);

    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["mint(uint256,address)"](shares, alice.address),
      "0_SHARES",
      "failed to prevent a zero share mint"
    );
  });
  it("Should not mint to 0 address", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const shareRatio = await priceOracle.price();

    const shares = fixedPointMul(assets, shareRatio);

    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["mint(uint256,address)"](shares, ADDRESS_ZERO),
      "0_RECEIVER",
      "failed to prevent mint to zero address"
    );
  });
  it("Mint Overloaded - Calculates assets correctly", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const aliceBalanceBefore = await asset.balanceOf(alice.address);

    const shareRatio = await priceOracle.price();

    const shares = fixedPointMul(assets, shareRatio);

    await vault
      .connect(alice)
      ["mint(uint256,address,uint256,bytes)"](
        shares,
        alice.address,
        shareRatio,
        []
      );

    const expectedAssets = fixedPointDiv(shares, shareRatio).add(1);

    const aliceBalanceAfter = await asset.balanceOf(alice.address);
    const aliceBalanceDiff = aliceBalanceBefore.sub(aliceBalanceAfter);

    assert(
      aliceBalanceDiff.eq(expectedAssets),
      `wrong alice assets ${expectedAssets} ${aliceBalanceDiff}`
    );
  });
  it("Mint Overloaded - Checks min share ratio is less than share ratio", async function () {
    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();
    const shareRatio = await priceOracle.price();

    const signers = await ethers.getSigners();
    const alice = signers[0];

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const shares = fixedPointMul(assets, shareRatio);

    await assertError(
      async () =>
        await vault["mint(uint256,address,uint256,bytes)"](
          shares,
          alice.address,
          shareRatio.add(1),
          []
        ),
      "MIN_SHARE_RATIO",
      "failed to respect min shareRatio"
    );
  });
  it("Mint Overloaded - Should not mint to 0 address", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const assets = ethers.BigNumber.from(5000);
    await asset.transfer(alice.address, assets);
    await asset.connect(alice).increaseAllowance(vault.address, assets);

    const shareRatio = await priceOracle.price();

    const shares = fixedPointMul(assets, shareRatio);

    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["mint(uint256,address,uint256,bytes)"](
            shares,
            ADDRESS_ZERO,
            shareRatio,
            []
          ),
      "0_RECEIVER",
      "failed to prevent mint to zero address"
    );
  });
  it("Mint Overloaded - Should not mint to 0 shares", async function () {
    const signers = await ethers.getSigners();
    const alice = signers[0];

    const [vault, asset, priceOracle] = await deployERC20PriceOracleVault();

    const shareRatio = await priceOracle.price();

    await assertError(
      async () =>
        await vault
          .connect(alice)
          ["mint(uint256,address,uint256,bytes)"](
            ethers.BigNumber.from(0),
            alice.address,
            shareRatio,
            []
          ),
      "0_SHARES",
      "failed to prevent a zero share mint"
    );
  });
});
