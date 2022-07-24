#!/usr/bin/env node

/*

need to run in ../sdk repo first:
    cargo build

Usage:
    ts-node cli.ts [command]

*/

import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { AnchorProvider } from '@project-serum/anchor';
import { Command, OptionValues, program } from 'commander';
const promptly = require('promptly');
const colors = require('colors');
import os from 'os';
import fs from 'fs';
import log from 'loglevel';
import {
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
    BN,
    BASE_PRECISION,
    QUOTE_PRECISION,
    MARK_PRICE_PRECISION,
    ZERO,
	convertToNumber,
    PositionDirection,
    BulkAccountLoader,
    ClearingHouse,
    EventSubscriber,
    SlotSubscriber,
    getMarketOrderParams,
    DriftEnv,
    initialize,
    Markets,
    Wallet,
    Banks,
    DevnetBanks,
    MarketAccount,
    OrderStatus,
    ClearingHouseUser,
    UserAccount,
    Order,
    UserPosition,
    isVariant,
} from '@drift-labs/sdk';
import { sign } from 'crypto';
import { clear } from 'console';

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
        console.error(`${getConfigFilePath()} does not exit. Run 'drift-v1 config init'`);
        return;
    }

    return JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'));
}

async function loadClearingHouse(provider: AnchorProvider): Promise<[ClearingHouse, Connection]> {


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

	console.log(`ClearingHouse ProgramId: ${clearingHouse.program.programId.toBase58()}`)
	console.log(`User Pubkey:             ${clearingHouse.getUser().userAccountPublicKey.toBase58()}`)

    return Promise.resolve([clearingHouse, connection]);
}


/*
COMMANDS
*/

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

const initUserCmd = program.command('init-user');
initUserCmd.action(async () => {
    const config = getConfig();

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }
    console.log(process.env.ANCHOR_WALLET);
    let provider = anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })
    const [clearingHouse, connection] = await loadClearingHouse(provider);
    await clearingHouse.subscribe();
    console.log(`initializing user account for: ${provider.wallet.publicKey.toString()}`);
    const tx = await clearingHouse.initializeUserAccount();
	console.log(tx);
});


const depositCmd = program.command('deposit');
depositCmd.action(async () => {
    const config = getConfig();

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }
    console.log(process.env.ANCHOR_WALLET);
    let provider = anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })
    const [clearingHouse, connection] = await loadClearingHouse(provider);

    if (!await clearingHouse.subscribe()) {
        throw new Error("Failed to subscribe to clearingHouse");
    }
    clearingHouse.eventEmitter.on('error', (e: Error) => {
        console.log('clearing house error');
        console.error(e);
    });
    let clearingHouseUser = clearingHouse.getUser();


    console.log("the banks:");
    for (let i = 0; i < DevnetBanks.length; i += 1) {
        let bank = DevnetBanks[i];
        console.log(`[${bank.bankIndex.toNumber()}]: ${bank.symbol}, mint: ${bank.mint.toString()}`);
    }
    console.log(`me: ${provider.wallet.publicKey.toString()}`)
    let ata = await getAssociatedTokenAddress(
        DevnetBanks[0].mint, // mint
        provider.wallet.publicKey,// owner
    );
    console.log(`ata: ${ata.toString()}`)

    const tx = await clearingHouse.deposit(
        new BN(1000).mul(QUOTE_PRECISION),
        new BN(0),
        ata);
    console.log(tx);
});

const placeOrderCmd = program.command('place-order');
placeOrderCmd.action(async () => {
    const config = getConfig();

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }
    console.log(process.env.ANCHOR_WALLET);
    let provider = anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })
    const [clearingHouse, connection] = await loadClearingHouse(provider);

    console.log(`CH sub: ${await clearingHouse.subscribe()}`);
    clearingHouse.eventEmitter.on('error', (e: Error) => {
        console.log('clearing house error');
        console.error(e);
    });
    let clearingHouseUser = clearingHouse.getUser();
    // console.log(clearingHouseUser)
    console.log(await clearingHouseUser.subscribe());

    let userAcc = clearingHouseUser.getUserAccount();
    console.log(`userAcc.userId: ${userAcc.userId}`);

    let markets = clearingHouse.getMarketAccounts();
    console.log(`markets: ${markets.length}`);
    let bid = markets[0].amm.lastBidPriceTwap;
    let ask = markets[0].amm.lastAskPriceTwap;
    console.log(`bidTWAP: ${convertToNumber(bid, MARK_PRICE_PRECISION)}, askTWAP: ${convertToNumber(ask, MARK_PRICE_PRECISION)}`);

    const marketOrderParams = getMarketOrderParams(
        new BN(0), // marketIndex
        PositionDirection.LONG, // direction
        ZERO, // quoteAssetAmt
        BASE_PRECISION, // baseAssetAmt
        false // reduceOnly
    );
    console.log("placing order:");
    const tx =  await clearingHouse.placeOrder(marketOrderParams);
    console.log(tx);

//    console.log(marketOrderParams);

   // await clearingHouse.cancelOrder(new BN(1));
   // await clearingHouse.getOrderByUserId()

    // const markets = clearingHouse.getMarketAccounts();

});

const marketCmd = program.command('market');
marketCmd.action(async () => {
    const config = getConfig();

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }
    console.log(process.env.ANCHOR_WALLET);
    let provider = anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })
    const [clearingHouse, connection] = await loadClearingHouse(provider);

    if (!await clearingHouse.subscribe()) {
        throw new Error("Failed to subscribe to clearingHouse");
    }
    clearingHouse.eventEmitter.on('error', (e: Error) => {
        console.log('clearing house error');
        console.error(e);
    });
    let clearingHouseUser = clearingHouse.getUser();


    console.log("the banks:");
    for (let i = 0; i < DevnetBanks.length; i += 1) {
        let bank = DevnetBanks[i];
        console.log(`[${bank.bankIndex.toNumber()}]: ${bank.symbol}, mint: ${bank.mint.toString()}`);
    }

    console.log("\nthe markets:");
    const markets = clearingHouse.getMarketAccounts();
    for (let i = 0; i < markets.length; i += 1) {
        const market = markets[i];
        const marketInfo = Markets["devnet"][i];
        console.log(`[${i}: ${marketInfo.symbol}]`);
        console.log(` . OI: ${market.openInterest.toString()}`);
        console.log(` . Market Idx: ${market.marketIndex.toString()}`);
        console.log(` . PnL Pool: ${market.pnlPool.balance!.toString()}`);
        console.log(` . Base Amount Long:  ${market.baseAssetAmountLong!.toString()}`);
        console.log(` . Base Amount Short: ${market.baseAssetAmountShort!.toString()}`);
        console.log(` . MRI: ${market.marginRatioInitial}`);
        console.log(` . MRM: ${market.marginRatioMaintenance}`);
        console.log(` . MRP: ${market.marginRatioPartial}`);
    }

    // clearingHouse.eventEmitter.on("update",(e:any)=> {
    //     console.log("update");
    //     console.log(e);
    // } )
    clearingHouse.eventEmitter.on("stateAccountUpdate",(e:any)=> {
        console.log("stateAccountUpdate");
        console.log(e);
    } )
    clearingHouse.eventEmitter.on("marketAccountUpdate",(m: MarketAccount)=> {
        console.log("marketAccountUpdate");
        const marketInfo = Markets["devnet"][0];
        const lastOraclePrice = m?.amm.lastOraclePrice;
        const baseSpread = m?.amm.baseSpread;
        const longSpread = m?.amm.longSpread;
        const shortSpread = m?.amm.shortSpread;
        const bidTwap = m?.amm.lastBidPriceTwap;
        const askTwap = m?.amm.lastAskPriceTwap;
        const oracleTwap = m?.amm.lastOraclePriceTwap;
        const markTwap = m?.amm.lastMarkPriceTwap;
        console.log(`ev: [${marketInfo.symbol}], oracle: ${(lastOraclePrice).toString()}, baseSpread: ${baseSpread?.toString()}, longSpread: ${longSpread.toString()}, shortSpready: ${shortSpread.toString()}`);
        console.log(` .  twap bid:    ${bidTwap.toString()}`);
        console.log(` .  twap ask:    ${askTwap.toString()}`);
        console.log(` .  twap oracle: ${oracleTwap.toString()}`);
        console.log(` .  twap mark:   ${markTwap.toString()}`);
    } )
    clearingHouse.eventEmitter.on("bankAccountUpdate",(e:any)=> {
        console.log("bankAccountUpdate");
        console.log(e);
    } )
    let m0 = clearingHouse.getMarketAccount(new BN(0));
    let eventSubscriber = new EventSubscriber(connection, anchor.workspace.ClearingHouse as Program);
    eventSubscriber.subscribe();



    setInterval(() => {
        const m = clearingHouse.getMarketAccount(new BN(0));
        const marketInfo = Markets["devnet"][0];
        const lastOraclePrice = m?.amm.lastOraclePrice;
        const baseSpread = m?.amm.baseSpread;
        const longSpread = m?.amm.longSpread;
        const shortSpread = m?.amm.shortSpread;
        console.log(`[${marketInfo.symbol}], oracle: ${(lastOraclePrice).toString()}, baseSpread: ${baseSpread?.toString()}, longSpread: ${longSpread.toString()}, shortSpready: ${shortSpread.toString()}`);

        const bidTwap = m?.amm.lastBidPriceTwap;
        const askTwap = m?.amm.lastAskPriceTwap;
        const oracleTwap = m?.amm.lastOraclePriceTwap;
        const markTwap = m?.amm.lastMarkPriceTwap;
        console.log(` .  twap bid:    ${bidTwap.toString()}`);
        console.log(` .  twap ask:    ${askTwap.toString()}`);
        console.log(` .  twap oracle: ${oracleTwap.toString()}`);
        console.log(` .  twap mark:   ${markTwap.toString()}`);

        // const orderRecord = eventSubscriber.getEventsArray('OrderRecord');
        const orderRecord = eventSubscriber.getEventList('OrderRecord');
        console.log(`orderRecords: ${orderRecord.size}`);

    }, 5000)
})

function printOpenOrders(userAcc: UserAccount): Order[] {
    let openOrders = 0;
    for (let i = 0; i < userAcc.orders.length; i += 1) {
        let o = userAcc.orders[i];

        if (isVariant(o.status, "init")) {
            continue
        }
        let orderTime = new Date(o.ts.toNumber() * 1000);
        let now: Date = new Date(Date.now());
        console.log(`OrderId: ${o.orderId.toString()}, [${(now.getTime() - orderTime.getTime()) / 1000}s ago], marketIdx: ${o.marketIndex.toString()}`);
        console.log(` . BAA:       ${o.baseAssetAmount.toString()}`);
        console.log(` . BAAfilled: ${o.baseAssetAmountFilled.toString()}`);
        console.log(` . QAA:       ${o.quoteAssetAmount.toString()}`);
        console.log(` . QAAfilled: ${o.quoteAssetAmountFilled.toString()}`);

        openOrders += 1;
    }
    console.log(`Open orders: ${openOrders}`)

    return userAcc.orders;
}

function printOpenPositions(userAcc: UserAccount): UserPosition[] {
    for (let i = 0; i < userAcc.positions.length; i += 1) {
        let p = userAcc.positions[i];
        if (p.baseAssetAmount.eq(new BN(0))) {
            continue;
        }
        console.log(` . (${i}) marketIdx: ${p.marketIndex.toString()}, baseAssetAmount: ${p.baseAssetAmount.toString()}, quoteAssetAmount: ${p.quoteAssetAmount.toString()}`);
    }

    return userAcc.positions;
}


const bulkPlaceTest = program.command('bulk-place-test');
bulkPlaceTest.action(async () => {
    const config = getConfig();

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }
    console.log(process.env.ANCHOR_WALLET);
    let provider = anchor.AnchorProvider.local('https://devnet.genesysgo.net', {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })
    const [clearingHouse, connection] = await loadClearingHouse(provider);

    console.log(`CH sub: ${await clearingHouse.subscribe()}`);
    // console.log(`CHU sub: ${Promise.all(clearingHouse.subscribeUsers())}`);
    clearingHouse.eventEmitter.on('error', (e: Error) => {
        console.log('clearing house error');
        console.error(e);
    });
    let clearingHouseUser = clearingHouse.getUser();
    console.log(await clearingHouseUser.subscribe());
    await clearingHouseUser.fetchAccounts()

    const userBank = clearingHouse.getUserBankBalance(0);
    console.log(`bank balance: ${userBank?.balance.toString()}`);
    console.log(`unsettled pnl: ${clearingHouseUser.getUnsettledPNL(new BN(0)).toString()}`);
    console.log(`unrealized pnl: ${clearingHouseUser.getUnrealizedPNL(new BN(0)).toString()}`);
    console.log(`unrealized funding pnl: ${clearingHouseUser.getUnrealizedFundingPNL(new BN(0)).toString()}`);

    // const t0 = await clearingHouse.settleFundingPayment(clearingHouseUser.userAccountPublicKey);
    // console.log(`settle funding payment: ${t0.toString()}`);
    const t1 = await clearingHouse.settlePNL(clearingHouseUser.userAccountPublicKey, clearingHouseUser.getUserAccount(), new BN(0));
    console.log(`settle pnl: ${t1.toString()}`);

    let userAcc = clearingHouseUser.getUserAccount();

    console.log(`\n==User open orders:`);
    printOpenOrders(userAcc);

    console.log(`\n==User positions:`);
    printOpenPositions(userAcc);


    for (let ii = 0; ii < 100; ii += 1) {
        let userAcc = clearingHouseUser.getUserAccount();
        console.log(`${ii}: User open orders:`);
        printOpenOrders(userAcc);

        console.log(`${ii}: User positions:`);
        printOpenPositions(userAcc);

        const marketOrderParams = getMarketOrderParams(
            new BN(0), // marketIndex
            PositionDirection.LONG, // direction
            ZERO, // quoteAssetAmt
            BASE_PRECISION.div(new BN(10)), // baseAssetAmt
            false, // reduceOnly
        );
        const tx =  await clearingHouse.placeAndTake(marketOrderParams);
        console.log(`placed order: ${tx}`);

        await clearingHouseUser.fetchAccounts()
    }

});

program.parse(process.argv);