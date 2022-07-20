#!/usr/bin/env node
import { Command, OptionValues, program } from 'commander';
const promptly = require('promptly');
const colors = require('colors');
import os from 'os';
import fs from 'fs';
import log from 'loglevel';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
	BN,
	BulkAccountLoader,
	ClearingHouse,
	DriftEnv,
	initialize,
	Markets,
	Wallet,
} from '@drift-labs/sdk';
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	Token,
	TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

log.setLevel(log.levels.INFO);

function commandWithDefaultOption(commandName: string): Command {
	return program
		.command(commandName)
		.option('-e, --env <env>', 'environment e.g devnet, mainnet-beta')
		.option('-k, --keypair <path>', 'Solana wallet')
		.option('-u, --url <url>', 'rpc url e.g. https://api.devnet.solana.com');
}

export function loadKeypair(keypairPath: string): Keypair {
	if (!keypairPath || keypairPath == '') {
		throw new Error('Keypair is required!');
	}
	const loaded = Keypair.fromSecretKey(
		new Uint8Array(JSON.parse(fs.readFileSync(keypairPath).toString()))
	);
	log.info(`Wallet public key: ${loaded.publicKey}`);
	return loaded;
}

export function getWallet(keypair: Keypair): Wallet {
	return new Wallet(keypair);
}


function logError(msg: string) {
	log.error(colors.red(msg));
}

function marketIndexFromSymbol(symbol: string): BN {
	const market = Markets["devnet"].filter(
		(market) => market.baseAssetSymbol === symbol
	)[0];
	if (!market) {
		const msg = `Could not find market index for ${symbol}`;
		logError(msg);
		throw Error(msg);
	}
	return market.marketIndex;
}

function getConfigFileDir(): string {
	return os.homedir() + `/.config/drift-v2`;
}

function getConfigFilePath(): string {
	return `${getConfigFileDir()}/config.json`;
}

function getConfig() {
	if (!fs.existsSync(getConfigFilePath())) {
		console.error('drfit-v1 config does not exit. Run `drift-v1 config init`');
		return;
	}

	return JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
}


/*
import * as anchor from '@project-serum/anchor';
import { AnchorProvider } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { Admin, BN, BulkAccountLoader } from '../sdk/src';

import dotenv = require('dotenv');
import { initialize } from '../sdk/src';
import {
   BASE_PRECISION,
   ClearingHouse,
   getMarketOrderParams,
   PositionDirection,
   QUOTE_PRECISION,
   ZERO,
} from '../sdk/src';
dotenv.config();

async function placeOrder(provider: AnchorProvider) {
   const connection = provider.connection;
   const config = initialize({ env: 'devnet' });
   const clearingHousePublicKey = new PublicKey(
      config.CLEARING_HOUSE_PROGRAM_ID
   );

   const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 500);
   const clearingHouse = new ClearingHouse({
      connection,
      wallet: provider.wallet,
      programID: clearingHousePublicKey,
      env: 'devnet',
      accountSubscription: {
         type: 'polling',
         accountLoader: bulkAccountLoader,
      },
   });

   await clearingHouse.subscribe();
   console.log(clearingHouse.getUserAccount(0).orders[0]);

   const marketOrderParams = getMarketOrderParams(
      new BN(0),
      PositionDirection.LONG,
      ZERO,
      BASE_PRECISION,
      false
   );

   // await clearingHouse.cancelOrder(new BN(1));
   await clearingHouse.placeOrder(marketOrderParams);

   await clearingHouse.unsubscribe();
}

try {
   if (!process.env.ANCHOR_WALLET) {
      throw new Error('ANCHOR_WALLET must be set.');
   }
   placeOrder(
      anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
         preflightCommitment: 'confirmed',
         skipPreflight: false,
         commitment: 'confirmed',
      })
   );
   // anchor.AnchorProvider.local('https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/');
} catch (e) {
   console.error(e);
}
*/

async function loadClearingHouse(config: any): Promise<ClearingHouse> {

	const connection = new Connection(config.url!);
	const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 500);

	const sdkConfig = initialize({ env: config.env! });
	const clearingHousePublicKey = new PublicKey(
		sdkConfig.CLEARING_HOUSE_PROGRAM_ID
	);

	const keypair = loadKeypair(config.keypair!);
	const wallet= getWallet(keypair)

	const clearingHouse = new ClearingHouse({
		connection,
		wallet,
		programID: clearingHousePublicKey,
		accountSubscription: {
			type: 'polling',
			accountLoader: bulkAccountLoader,
		},
		env: config.env! as DriftEnv,
	});

	console.log(`ClearingHouse Program at: ${await clearingHouse.getStatePublicKey()}`)

	return Promise.resolve(clearingHouse);
}

const configcmd = program.command('config');

configcmd.command('init').action(async () => {
	const defaultConfig = {
		env: 'devnet',
		url: 'https://api.devnet.solana.com',
		keypair: `${os.homedir()}/.config/solana/id.json`,
	};

	const dir = getConfigFileDir();
	if (!fs.existsSync(getConfigFileDir())) {
		fs.mkdirSync(dir, { recursive: true });
	}

	fs.writeFileSync(getConfigFilePath(), JSON.stringify(defaultConfig));
	console.log(`Wrote config to ${getConfigFilePath()}`);
});

configcmd
	.command('set')
	.argument('<key>', 'the config key e.g. env, url, keypair')
	.argument('<value>')
	.action(async (key, value) => {
		if (key !== 'env' && key !== 'url' && key !== 'keypair') {
			console.error(`Key must be env, url or keypair`);
			return;
		}

		const config = JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
		config[key] = value;
		fs.writeFileSync(getConfigFilePath(), JSON.stringify(config));
	});

configcmd.command('get').action(async () => {
	const config = getConfig();
	console.log(JSON.stringify(config, null, 4));
});

const placeOrderCmd = program.command('place-order');

placeOrderCmd.action(async () => {
	const config = getConfig();
	const clearingHouse = await loadClearingHouse(config);

	await clearingHouse.subscribe();
	clearingHouse.eventEmitter.on('error', (e: Error) => {
		console.log('clearing house error');
		console.error(e);
	});

	const markets = clearingHouse.getMarketAccounts();

	console.log("hihi");
	const user = clearingHouse.getUsers();
	const bank = clearingHouse.getBankAccount(0);
	const userAccount = clearingHouse.getUserAccount();
	console.log("user: ");
	console.log(user);
	console.log(user.keys());
	// console.log("")
	// console.log("markets: ");
	// console.log(markets);
});

program.parse(process.argv);
