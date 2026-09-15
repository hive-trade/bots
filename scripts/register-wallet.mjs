#!/usr/bin/env node
import { loadConfig, registerWallet } from "../examples/bot-starter/bot.mjs";

const config = loadConfig();
const result = await registerWallet({
  account: config.account,
  api: config.api,
  hiveId: config.hiveId,
  walletAddress: config.depositWallet,
});
console.log("Wallet registration accepted:", result);
