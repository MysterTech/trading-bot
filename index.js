require("dotenv").config();
const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const BigNumber = require("bignumber.js");
const _ = require("lodash");

const oneSplitABI = require("./abis/onesplit.json");
const onesplitAddress = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E"; // 1plit contract address on Main net

const erc20ABI = require("./abis/erc20.json");
const kncAddress = "0xdd974D5C2e2928deA5F71b9825b8b646686BD200";

const fromAddress = process.env.ACCOUNT;

const fromToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; //ETH
const fromTokenDecimals = 18;

const toToken = kncAddress;
const toTokenDecimals = 18;

// WEB3 CONFIG
const web3 = new Web3(
  new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL)
);

const amountToExchange = new BigNumber(0.01);

const onesplitContract = new web3.eth.Contract(oneSplitABI, onesplitAddress);
const kncToken = new web3.eth.Contract(erc20ABI, toToken);
const ethToken = new web3.eth.Contract(erc20ABI, fromToken);

const oneSplitDexes = [
  "Uniswap",
  "Kyber",
  "Bancor",
  "Oasis",
  "Curve Compound",
  "Curve USDT",
  "Curve Y",
  "Curve Binance",
  "Curve Synthetix",
  "Uniswap Compound",
  "Uniswap CHAI",
  "Uniswap Aave",
  "Mooniswap",
  "Uniswap V2",
  "Uniswap V2 ETH",
  "Uniswap V2 DAI",
  "Uniswap V2 USDC",
  "Curve Pax",
  "Curve renBTC",
  "Curve tBTC",
  "Dforce XSwap",
  "Shell",
  "mStable mUSD",
  "Curve sBTC",
  "Balancer 1",
  "Balancer 2",
  "Balancer 3",
  "Kyber 1",
  "Kyber 2",
  "Kyber 3",
  "Kyber 4",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTransaction(txHash) {
  let tx = null;
  while (tx == null) {
    tx = await web3.eth.getTransactionReceipt(txHash);
    await sleep(2000);
  }
  console.log("Transaction " + txHash + " was mined.");
  return tx.status;
}

function approveToken(tokenInstance, receiver, amount, callback) {
  tokenInstance.methods
    .approve(receiver, amount)
    .send({ from: fromAddress }, async function (error, txHash) {
      if (error) {
        console.log("ERC20 could not be approved", error);
        return;
      }
      console.log("ERC20 token approved to " + receiver);
      const status = await waitTransaction(txHash);
      if (!status) {
        console.log("Approval transaction failed.");
        return;
      } else {
        console.log("Status : " + status);
      }
      callback();
    });
}

async function getQuote(fromToken, toToken, amount, callback) {
  let quote = null;
  try {
    quote = await onesplitContract.methods
      .getExpectedReturn(fromToken, toToken, amount, 100, 0)
      .call();
  } catch (error) {
    console.log("Impossible to get the quote", error);
  }
  console.log("Trade From: " + fromToken);
  console.log("Trade To: " + toToken);
  console.log("Trade Amount: " + "0.01");
  console.log(
    new BigNumber(quote.returnAmount).shiftedBy(-fromTokenDecimals).toFixed()
  );
  console.log("Using Dexes:");
  for (let index = 0; index < quote.distribution.length; index++) {
    if (quote.distribution[index] != 0)
      console.log(
        oneSplitDexes[index] + ": " + quote.distribution[index] + "%"
      );
  }
  callback(quote);
}

let amountWithDecimals = new BigNumber(amountToExchange)
  .shiftedBy(fromTokenDecimals)
  .toFixed();

getQuote(fromToken, toToken, amountWithDecimals, function (quote) {
  let amountWithGas = new BigNumber(85)
    .shiftedBy(fromTokenDecimals / 2)
    .plus(amountWithDecimals);
  approveToken(ethToken, onesplitAddress, amountWithGas, async function () {
    //let minReturn = new BigNumber(quote.returnAmount).multipliedBy(0.998);
    console.log("Getting initial balances");
    // We get the balance before the swap just for logging purpose
    let ethBalanceBefore = await web3.eth.getBalance(fromAddress);
    let kncBalanceBefore = await kncToken.methods.balanceOf(fromAddress).call();

    console.log("Starting swap");
    onesplitContract.methods
      .swap(
        fromToken,
        toToken,
        amountWithDecimals,
        quote.returnAmount,
        quote.distribution,
        0
      )
      .send({ from: fromAddress, gas: 85000000000 }, async function (
        error,
        txHash
      ) {
        if (error) {
          console.log("Could not complete the swap", error);
          return;
        }
        const status = await waitTransaction(txHash);
        // We check the final balances after the swap for logging purpose
        let ethBalanceAfter = await web3.eth.getBalance(fromAddress);
        let kncBalanceAfter = await kncToken.methods
          .balanceOf(fromAddress)
          .call();
        console.log("Final balances:");
        console.log(
          "Change in ETH balance",
          new BigNumber(ethBalanceAfter)
            .minus(ethBalanceBefore)
            .shiftedBy(-fromTokenDecimals)
            .toFixed(2)
        );
        console.log(
          "Change in KNC balance",
          new BigNumber(kncBalanceAfter)
            .minus(kncBalanceBefore)
            .shiftedBy(-fromTokenDecimals)
            .toFixed(2)
        );
      });
  });
});
