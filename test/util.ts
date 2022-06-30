import chai from "chai";
import { ethers } from "hardhat";
import { ContractTransaction, Contract, BigNumber } from "ethers";
const { assert } = chai;
import { Result } from "ethers/lib/utils";
import type { ERC20PriceOracleVault } from "../typechain/ERC20PriceOracleVault";
import type { ChainlinkFeedPriceOracle } from "../typechain/ChainlinkFeedPriceOracle";
import type { TwoPriceOracle } from "../typechain/TwoPriceOracle";
import type { TestErc20 } from "../typechain/TestErc20";
import type { TestChainlinkDataFeed } from "../typechain/TestChainlinkDataFeed";

export const ethMainnetFeedRegistry =
  "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";
export const feedRegistryDenominationEth =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const feedRegistryDenominationXau =
  "0x0000000000000000000000000000000000000959";

export const chainlinkXauUsd = "0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6";
export const chainlinkEthUsd = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

export const eighteenZeros = "000000000000000000";
export const sixZeros = "000000";
export const xauOne = "100000000";

export const priceOne = ethers.BigNumber.from("1" + eighteenZeros);
export const ONE = priceOne

export const usdDecimals = 8;
export const xauDecimals = 8;

const quoteAnswer = "191832000000"
const baseAnswer = "106045000000"

export const fixedPointMul = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(b).div(ONE);
export const fixedPointDiv = (a: BigNumber, b: BigNumber): BigNumber =>
  a.mul(ONE).div(b);

export const RESERVE_ONE = ethers.BigNumber.from("1" + sixZeros);

export const deployERC20PriceOracleVault = async (): Promise<
  [
    ERC20PriceOracleVault,
    TestErc20,
    TwoPriceOracle,
    TestChainlinkDataFeed,
    TestChainlinkDataFeed
  ]
> => {
  const oracleFactory = await ethers.getContractFactory(
    "TestChainlinkDataFeed"
  );
  const basePriceOracle = await oracleFactory.deploy();
  await basePriceOracle.deployed();
  const signers = await ethers.getSigners();
  // ETHUSD as of 2022-06-30

  await basePriceOracle.setDecimals(usdDecimals);
  await basePriceOracle.setRoundData(1, {
    startedAt: BigNumber.from(Date.now()).div(1000),
    updatedAt: BigNumber.from(Date.now()).div(1000),
    answer: baseAnswer,
    answeredInRound: 1,
  });

  const quotePriceOracle = await oracleFactory.deploy();
  await quotePriceOracle.deployed();
  // XAUUSD as of 2022-06-30
  await quotePriceOracle.setDecimals(xauDecimals);
  await quotePriceOracle.setRoundData(1, {
    startedAt: BigNumber.from(Date.now()).div(1000),
    updatedAt: BigNumber.from(Date.now()).div(1000),
    answer: quoteAnswer,
    answeredInRound: 1,
  });

  const testErc20 = await ethers.getContractFactory("TestErc20");
  const testErc20Contract = await testErc20.deploy();
  await testErc20Contract.deployed();

  const chainlinkFeedPriceOracleFactory = await ethers.getContractFactory(
    "ChainlinkFeedPriceOracle"
  );
  const chainlinkFeedPriceOracleBase =
    await chainlinkFeedPriceOracleFactory.deploy({
      feed: basePriceOracle.address,
      staleAfter: 1000,
    });
  const chainlinkFeedPriceOracleQuote =
    await chainlinkFeedPriceOracleFactory.deploy({
      feed: quotePriceOracle.address,
      staleAfter: 1000,
    });
  await chainlinkFeedPriceOracleBase.deployed();
  await chainlinkFeedPriceOracleQuote.deployed();

  const twoPriceOracleFactory = await ethers.getContractFactory(
    "TwoPriceOracle"
  );
  const twoPriceOracle = await twoPriceOracleFactory.deploy({
    base: chainlinkFeedPriceOracleBase.address,
    quote: chainlinkFeedPriceOracleQuote.address,
  });

  const erc20PriceOracleVaultFactory = await ethers.getContractFactory(
    "ERC20PriceOracleVault"
  );
  const erc20PriceOracleVault = (await erc20PriceOracleVaultFactory.deploy({
    asset: testErc20Contract.address,
    name: "EthGild",
    symbol: "ETHg",
    uri: "ipfs://bafkreiahuttak2jvjzsd4r62xoxb4e2mhphb66o4cl2ntegnjridtyqnz4",
    priceOracle: twoPriceOracle.address,
  })) as ERC20PriceOracleVault;
  await erc20PriceOracleVault.deployed();

  return [
    erc20PriceOracleVault,
    testErc20Contract,
    twoPriceOracle,
    basePriceOracle,
    quotePriceOracle,
  ];
};

export const expectedReferencePrice = ethers.BigNumber.from(baseAnswer).mul(priceOne).div(ethers.BigNumber.from(quoteAnswer))

export const assertError = async (f: Function, s: string, e: string) => {
  let didError = false;
  try {
    await f();
  } catch (err) {
    if (err instanceof Error) {
      assert(
        err.toString().includes(s),
        `error string ${err} does not include ${s}`
      );
    } else {
      throw "err not an Error";
    }
    didError = true;
  }
  assert(didError, e);
};

export const expectedName = "EthGild";
export const expectedSymbol = "ETHg";
export const expectedUri =
  "ipfs://bafkreiahuttak2jvjzsd4r62xoxb4e2mhphb66o4cl2ntegnjridtyqnz4";

/// @param tx - transaction where event occurs
/// @param eventName - name of event
/// @param contract - contract object holding the address, filters, interface
/// @returns Event arguments, can be deconstructed by array index or by object key
export const getEventArgs = async (
  tx: ContractTransaction,
  eventName: string,
  contract: Contract
): Promise<Result> => {
  const events = (await tx.wait()).events || [];
  const filter = (contract.filters[eventName]().topics || [])[0];
  const eventObj = events.find(
    (x) => x.topics[0] == filter && x.address == contract.address
  );

  if (!eventObj) {
    throw new Error(`Could not find event with name ${eventName}`);
  }

  return contract.interface.decodeEventLog(eventName, eventObj.data);
};
