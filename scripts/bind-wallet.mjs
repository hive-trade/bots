// Register the wallet: tell HiveTrade which Polymarket deposit wallet belongs
// to this bot's Hive. A setup write signed by the bot's key, not a trade.
import { isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../lib/config.mjs';
import { registerWallet } from '../lib/protocol.mjs';
import { SafeError, stopMessage } from '../lib/errors.mjs';
try {
  const cfg = config(process.env, { requireHiveId: true });
  if (cfg.venue !== 'polymarket') throw new SafeError('Registering a wallet is only for Polymarket Hives (VENUE=polymarket).');
  const walletAddress = process.env.POLYMARKET_DEPOSIT_WALLET;
  if (!isAddress(walletAddress ?? '')) throw new SafeError('POLYMARKET_DEPOSIT_WALLET is not set to a wallet address. Set it in .env to the bot\'s deposit wallet.');
  if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.BOT_PRIVATE_KEY ?? '')) throw new SafeError('BOT_PRIVATE_KEY in .env is missing or malformed. Restore .env from your backup; never paste a key in chat.');
  const account = privateKeyToAccount(process.env.BOT_PRIVATE_KEY);
  if (walletAddress.toLowerCase() === account.address.toLowerCase()) throw new SafeError('POLYMARKET_DEPOSIT_WALLET is the signing address. Set it to the bot\'s deposit wallet instead.');
  await registerWallet({ account, api: cfg.api, hiveId: cfg.hiveId, walletAddress });
  console.log('Wallet registered: HiveTrade accepted this deposit wallet for the Hive.');
} catch (error) {
  console.error(stopMessage('wallet registration', error, { stateDir: process.env.STATE_DIR || './state' }));
  process.exitCode = 1;
}
