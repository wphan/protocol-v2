import os from 'os';
import fs from 'fs';
import { AnchorProvider } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
    Token,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
    BN,
    MARK_PRICE_PRECISION,
    DevnetBanks,
	convertToNumber,
    BulkAccountLoader,
    ClearingHouse,
    initialize,
    Markets,
    Wallet,
    MarketAccount,
    UserAccount,
    UserPosition,
    Order,
    isVariant,
    positionIsAvailable,
} from '@drift-labs/sdk';
import { clear } from 'console';


export function printMarketPrices(m: MarketAccount) {
    const marketInfo = Markets["devnet"][0];
    const lastOraclePrice = convertToNumber(m?.amm.lastOraclePrice, MARK_PRICE_PRECISION).toFixed(3);
    const baseSpread = m?.amm.baseSpread;
    const longSpread = m?.amm.longSpread;
    const shortSpread = m?.amm.shortSpread;
    const bidTwap = convertToNumber(m?.amm.lastBidPriceTwap, MARK_PRICE_PRECISION).toFixed(3);
    const askTwap = convertToNumber(m?.amm.lastAskPriceTwap, MARK_PRICE_PRECISION).toFixed(3);
    const oracleTwap = convertToNumber(m?.amm.lastOraclePriceTwap, MARK_PRICE_PRECISION).toFixed(3);
    const markTwap = convertToNumber(m?.amm.lastMarkPriceTwap, MARK_PRICE_PRECISION).toFixed(3);
    console.log(`[${marketInfo.symbol}], oracle: ${lastOraclePrice}, baseSpread: ${baseSpread}, longSpread: ${longSpread}, shortSpready: ${shortSpread}`);
    console.log(` .  twap bid:    ${bidTwap}`);
    console.log(` .  twap ask:    ${askTwap}`);
    console.log(` .  twap oracle: ${oracleTwap}`);
    console.log(` .  twap mark:   ${markTwap}`);
}

export function printOpenPositions(userAcc: UserAccount): Array<UserPosition> {
    const positions: Array<UserPosition> = [];
    for (let i = 0; i < userAcc.positions.length; i += 1) {
        let p = userAcc.positions[i];
        if (p.baseAssetAmount.eq(new BN(0))) {
            continue;
        }
        positions.push(p);
        console.log(` . (${i}) marketIdx: ${p.marketIndex.toString()}, baseAssetAmount: ${p.baseAssetAmount.toString()}, quoteAssetAmount: ${p.quoteAssetAmount.toString()}`);
    }
    console.log(`Open positions: ${positions.length}`)

    return positions;
}

export function printOpenOrders(userAcc: UserAccount): Array<Order> {
    let openOrders: Array<Order> = [];
    for (let i = 0; i < userAcc.orders.length; i += 1) {
        let o = userAcc.orders[i];

        if (isVariant(o.status, "init")) {
            continue
        }
        let orderTime = new Date(o.ts.toNumber() * 1000);
        let now: Date = new Date(Date.now());
        console.log(`OrderId: ${o.orderId.toString()}, [${(now.getTime() - orderTime.getTime()) / 1000}s ago], marketIdx: ${o.marketIndex.toString()}`);
        console.log(` . BAA:       ${o.baseAssetAmount?.toString()}`);
        console.log(` . BAAfilled: ${o.baseAssetAmountFilled?.toString()}`);
        console.log(` . QAA:       ${o.quoteAssetAmount?.toString()}`);
        console.log(` . QAAfilled: ${o.quoteAssetAmountFilled?.toString()}`);

        openOrders.push(o);
    }
    console.log(`Open orders: ${openOrders.length}`)

    return openOrders;
}


export function getConfigFileDir(): string {
    return os.homedir() + `/.config/drift-v2`;
}

export function getConfigFilePath(): string {
    return `${getConfigFileDir()}/trading-config.json`;
}

export function loadCliConfig(): any {
    if (!fs.existsSync(getConfigFilePath())) {
        console.error(`${getConfigFilePath()} does not exit. Run 'drift-v2-trading config init'`);
        return;
    }

    const config = JSON.parse(fs.readFileSync(getConfigFilePath(), 'utf8'))

    if (!process.env.ANCHOR_WALLET) {
        if (!config.keypair) {
            throw new Error('ANCHOR_WALLET or config.keypair must be set.');
        }
        process.env.ANCHOR_WALLET = config.keypair;
    }

    return config;
}


export function loadKeypair(keypairPath: string): Keypair {
    if (!keypairPath || keypairPath == '') {
        throw new Error('Keypair is required!');
    }
    const loaded = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(keypairPath).toString()))
    );
    console.log(`Wallet public key: ${loaded.publicKey}`);
    return loaded;
}

export function getWallet(keypair: Keypair): Wallet {
    return new Wallet(keypair);
}

export async function loadClearingHouse(requireUser: boolean, errorHandler?: (e: Error)=>void, confirmOpts?: any): Promise<[ClearingHouse, Connection, AnchorProvider]> {

    loadCliConfig();

    const provider = AnchorProvider.local('https://devnet.genesysgo.net', confirmOpts || {
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        commitment: 'confirmed',
    })

    const connection = provider.connection;
    const cfg = initialize({ env: 'devnet' });
    const clearingHousePublicKey = new PublicKey(
        cfg.CLEARING_HOUSE_PROGRAM_ID
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

    clearingHouse.eventEmitter.on('error', (e: Error) => {
        if (errorHandler) {
            errorHandler(e)
        }
        console.log('clearing house error');
        console.error(e);
    });

    await clearingHouse.subscribe();

	const lamportsBalance = await connection.getBalance(provider.wallet.publicKey);
	const tokenAccount = await Token.getAssociatedTokenAddress(
		ASSOCIATED_TOKEN_PROGRAM_ID,
		TOKEN_PROGRAM_ID,
        DevnetBanks[0].mint, // mint
		provider.wallet.publicKey
	);
	const usdcBalance = await connection.getTokenAccountBalance(tokenAccount);

	console.log(`ClearingHouse ProgramId:  ${clearingHouse.program.programId.toBase58()}`)
    console.log(`ClearingHouse subscribed: ${clearingHouse.isSubscribed}`)
	console.log(`UserAccount exists?:      ${await clearingHouse.getUser().exists()}`)
	console.log(`UserAccount Pubkey:       ${clearingHouse.getUser().userAccountPublicKey.toBase58()}`)
	console.log(`User Wallet:              ${provider.wallet.publicKey.toBase58()}`)
	console.log(`  SOL balance:  ${lamportsBalance / 10 ** 9}`);
	console.log(`  USDC balance: ${usdcBalance.value.uiAmount}`);

    if (!await clearingHouse.getUser().exists() && requireUser) {
        throw new Error('User account does not exist! call initializeUser first');
    }

    await clearingHouse.fetchAccounts()

    return Promise.resolve([clearingHouse, connection, provider]);
}