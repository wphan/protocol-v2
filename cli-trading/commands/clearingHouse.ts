import { Program,  workspace } from '@project-serum/anchor';
import {
    Token,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
    isVariant,
    BASE_PRECISION,
    BN,
    ClearingHouse,
    convertToNumber,
    DevnetBanks,
    EventSubscriber,
    getMarketOrderParams,
    MarketAccount,
    Markets,
    MARK_PRICE_PRECISION,
    OrderType,
    PositionDirection,
    QUOTE_PRECISION,
    ZERO,
    DevnetMarkets,
} from '@drift-labs/sdk'

import {
    printMarketPrices,
    printOpenOrders,
    printOpenPositions,
    loadClearingHouse
} from '../utils';
import { clear } from 'console';

export async function initializeUser() {

    const [clearingHouse,,provider] = await loadClearingHouse(false);

    const chUser = clearingHouse.getUser();
    if (await chUser.exists()){
        throw new Error(`User account already exists for ${chUser.userAccountPublicKey}`)
    }

    console.log(`initializing user account for: ${provider.wallet.publicKey.toString()}`);
    const tx = await clearingHouse.initializeUserAccount();

	console.log(tx);
}

export async function depositCollateral() {
    const [clearingHouse,,provider] = await loadClearingHouse(true);

    if (!await clearingHouse.subscribe()) {
        throw new Error("Failed to subscribe to clearingHouse");
    }
    clearingHouse.eventEmitter.on('error', (e: Error) => {
        console.log('clearing house error');
        console.error(e);
    });

    console.log("the banks:");
    for (let i = 0; i < DevnetBanks.length; i += 1) {
        let bank = DevnetBanks[i];
        console.log(`[${bank.bankIndex.toNumber()}]: ${bank.symbol}, mint: ${bank.mint.toString()}`);
    }

	const ata = await Token.getAssociatedTokenAddress(
		ASSOCIATED_TOKEN_PROGRAM_ID,
		TOKEN_PROGRAM_ID,
        DevnetBanks[0].mint, // mint
		provider.wallet.publicKey,
	);

    const depositAmt = 1000; // TODO make this cli arg
    console.log(`Depositing ${depositAmt} USDC`)
    const tx = await clearingHouse.deposit(
        new BN(depositAmt).mul(QUOTE_PRECISION),
        new BN(0),
        ata);
    console.log(`Deposit tx: ${tx}`);
}

export async function withdrawCollateral() {
    const [clearingHouse,,provider] = await loadClearingHouse(true);

    for (let i = 0; i < DevnetBanks.length; i += 1) {
        let bank = DevnetBanks[i];

        const userBank = clearingHouse.getUserBankBalance(bank.bankIndex.toNumber());
        if (!userBank) {
            continue
        }

        console.log(`[${bank.bankIndex.toNumber()}]: ${bank.symbol}, mint: ${bank.mint.toString()}`);
        const bankType = isVariant(userBank?.balanceType, "deposit") ? "deposit" : "borrow";
        console.log(`  ${bankType} balance: ${convertToNumber(userBank!.balance, QUOTE_PRECISION).toString()}`);

        const ata = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            bank.mint, // mint
            provider.wallet.publicKey,
        );

        const tx = await clearingHouse.withdraw(userBank.balance, bank.bankIndex, ata);
        console.log(`Withdraw tx: ${tx}`);
    }

    printPortfolioDetails(clearingHouse);
}

export async function viewMarketInfo() {
    const [clearingHouse, connection,] = await loadClearingHouse(true);

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

    clearingHouse.eventEmitter.on("stateAccountUpdate",(e:any)=> {
        console.log("stateAccountUpdate");
        console.log(e);
    } )

    clearingHouse.eventEmitter.on("marketAccountUpdate",(m: MarketAccount)=> {
        console.log("marketAccountUpdate");
        printMarketPrices(m);
    } )
    clearingHouse.eventEmitter.on("bankAccountUpdate",(e:any)=> {
        console.log("bankAccountUpdate");
        console.log(e);
    } )

    let m0 = clearingHouse.getMarketAccount(new BN(0));
    let eventSubscriber = new EventSubscriber(connection, workspace.ClearingHouse as Program);
    eventSubscriber.subscribe();


    setInterval(() => {
        const m = clearingHouse.getMarketAccount(new BN(0));
        printMarketPrices(m!);

        const orderRecord = eventSubscriber.getEventList('OrderRecord');
        console.log(`orderRecords: ${orderRecord.size}`);

    }, 5000)
}

function printPortfolioDetails(clearingHouse: ClearingHouse) {
    const chUser = clearingHouse.getUser();
    const userAcc = chUser.getUserAccount();

    console.log("Banks:")
    for (const bank of DevnetBanks) {

        const userBank = clearingHouse.getUserBankBalance(bank.bankIndex.toNumber());
        if (!userBank) {
            continue
        }

        console.log(`[${bank.bankIndex.toNumber()}]: ${bank.symbol}, mint: ${bank.mint.toString()}`);
        const bankType = isVariant(userBank?.balanceType, "deposit") ? "deposit" : "borrow";
        console.log(`  ${bankType} balance: ${convertToNumber(userBank!.balance, QUOTE_PRECISION).toString()}`);
    }

    
    console.log(`initialMarginRequirement: ${chUser.getInitialMarginRequirement().toString()}`);
    console.log(`partialMarginRequirement: ${chUser.getPartialMarginRequirement().toString()}`);
    console.log(`collateral value:       ${chUser.getCollateralValue().toString()}`);
    console.log(`totatl leverage:        ${chUser.getLeverage().toString()}`);
    console.log(`unsettled pnl:          ${chUser.getUnsettledPNL(new BN(0)).toString()}`);
    console.log(`unrealized pnl:         ${chUser.getUnrealizedPNL().toString()}`);
    console.log(`unrealized funding pnl: ${chUser.getUnrealizedFundingPNL(new BN(0)).toString()}`);

    console.log(`Open Orders:`);
    printOpenOrders(userAcc);

    console.log(`Open Positions:`);
    printOpenPositions(userAcc);
}

export async function viewPortfolio() {
    const [clearingHouse,,] = await loadClearingHouse(true);

    setInterval(() => {
        console.log("")
        printPortfolioDetails(clearingHouse);
    }, 5000)
}

export async function viewUserPortfolio() {
     // TODO get a specific user's portfolio and account
    const [clearingHouse,,] = await loadClearingHouse(true);

    setInterval(() => {
        console.log("")
        printPortfolioDetails(clearingHouse);
    }, 5000)
}


export async function closePositions() {
    const [clearingHouse,,] = await loadClearingHouse(true);

    const chUser = clearingHouse.getUser();
    const userAcc = chUser.getUserAccount();

    printPortfolioDetails(clearingHouse);

    for (const position of printOpenPositions(userAcc)) {
        const tx = await clearingHouse.closePosition(position.marketIndex);
        console.log(`close position tx: ${tx}`);
    }

    setTimeout(() => {
        printPortfolioDetails(clearingHouse);
        console.log("Done!")
    }, 5000)
}

export async function settleEverything() {
    const [clearingHouse,,provider] = await loadClearingHouse(true);

    const userAcc = clearingHouse.getUserAccount();

    if (!userAcc) {
        throw new Error("Couldn't get UserAccount");
    }

    printPortfolioDetails(clearingHouse);

    for (const market of DevnetMarkets) {
        console.log(`settling market: ${market.symbol}`);
        let tx = await clearingHouse.settleFundingPayment(provider.wallet.publicKey);
        console.log(`  settleFundingPayment tx: ${tx}`);

        tx = await clearingHouse.settlePNL(provider.wallet.publicKey, userAcc, market.marketIndex);
        console.log(`  settlePNL tx: ${tx}`);
    }

    setInterval(() => {
        console.log("")
        printPortfolioDetails(clearingHouse);
    }, 5000)
}

export async function placeOrder() {
    const [clearingHouse,,] = await loadClearingHouse(true);

    printPortfolioDetails(clearingHouse);

    const clearingHouseUser = clearingHouse.getUser();
    let userAcc = clearingHouseUser.getUserAccount();
    console.log(`userAcc.userId: ${userAcc.userId}`);

    let markets = clearingHouse.getMarketAccounts();
    let bid = markets[0].amm.lastBidPriceTwap;
    let ask = markets[0].amm.lastAskPriceTwap;
    console.log(`bidTWAP: ${convertToNumber(bid, MARK_PRICE_PRECISION)}, askTWAP: ${convertToNumber(ask, MARK_PRICE_PRECISION)}`);

    
    console.log("placing order:");
    // old way
    // const marketOrderParams = getMarketOrderParams(
    //     new BN(0), // marketIndex
    //     PositionDirection.LONG, // direction
    //     ZERO, // quoteAssetAmt
    //     BASE_PRECISION.div(new BN(10)), // baseAssetAmt
    //     false, // reduceOnly
    // );
    // const tx =  await clearingHouse.placeAndTake(marketOrderParams);

    // new way
    try {
        const tx =  await clearingHouse.placeOrder({
            orderType: OrderType.MARKET,
            marketIndex: new BN(0),
            baseAssetAmount: new BN(1).mul(BASE_PRECISION),
            direction: PositionDirection.LONG,
        });
        console.log(tx);
    } catch(e) {
        console.error(e)
    }

    setInterval(() => {
        console.log("")
        printPortfolioDetails(clearingHouse);
    }, 5000)
}

export async function bulkOrderTest() {
    const [clearingHouse,,] = await loadClearingHouse(true);

    let clearingHouseUser = clearingHouse.getUser();
    console.log(await clearingHouseUser.subscribe());
    await clearingHouseUser.fetchAccounts()

    const userBank = clearingHouse.getUserBankBalance(0);
    console.log(`bank balance: ${userBank?.balance.toString()}`);
    console.log(`unsettled pnl: ${clearingHouseUser.getUnsettledPNL(new BN(0)).toString()}`);
    console.log(`unrealized pnl: ${clearingHouseUser.getUnrealizedPNL().toString()}`);
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


    for (let ii = 0; ii < 3; ii += 1) {
        let userAcc = clearingHouseUser.getUserAccount();
        console.log(`${ii}: User open orders:`);
        printOpenOrders(userAcc);

        console.log(`${ii}: User positions:`);
        printOpenPositions(userAcc);

        // old
        // const marketOrderParams = getMarketOrderParams(
        //     new BN(0), // marketIndex
        //     PositionDirection.LONG, // direction
        //     ZERO, // quoteAssetAmt
        //     BASE_PRECISION.div(new BN(10)), // baseAssetAmt
        //     false, // reduceOnly
        // );
        // const tx =  await clearingHouse.placeAndTake(marketOrderParams);

        const tx =  await clearingHouse.placeOrder({
            orderType: OrderType.MARKET,
            marketIndex: new BN(0),
            baseAssetAmount: BASE_PRECISION.div(new BN(10)),
            direction: PositionDirection.LONG,
            immediateOrCancel: true,
        });
        console.log(`placed order: ${tx}`);

        await clearingHouseUser.fetchAccounts()
    }
}