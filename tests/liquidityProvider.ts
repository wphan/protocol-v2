import * as anchor from '@project-serum/anchor';
import { assert } from 'chai';
import {
	BN,
	calculateAmmReservesAfterSwap,
	calculatePrice,
	ClearingHouseUser,
	OracleSource,
	SwapDirection,
	Wallet,
} from '../sdk';

import { Program } from '@project-serum/anchor';

import * as web3 from '@solana/web3.js';

import {
	Admin,
	QUOTE_PRECISION,
	AMM_RESERVE_PRECISION,
	EventSubscriber,
	MARK_PRICE_PRECISION,
	PositionDirection,
	ZERO,
} from '../sdk/src';

import {
	initializeQuoteAssetBank,
	mockOracle,
	mockUSDCMint,
	mockUserUSDCAccount,
} from './testHelpers';
import { setFeedPrice } from '../stress/mockPythUtils';

async function adjustOraclePostSwap(baa, swapDirection, market) {
	const price = calculatePrice(
		market.amm.baseAssetReserve,
		market.amm.quoteAssetReserve,
		market.amm.pegMultiplier
	);

	const [newQaa, newBaa] = calculateAmmReservesAfterSwap(
		market.amm,
		'base',
		baa.abs(),
		swapDirection
	);

	const newPrice = calculatePrice(newBaa, newQaa, market.amm.pegMultiplier);
	const _newPrice = newPrice.toNumber() / MARK_PRICE_PRECISION.toNumber();
	await setFeedPrice(anchor.workspace.Pyth, _newPrice, market.amm.oracle);

	console.log('price => new price', price.toString(), newPrice.toString());

	return _newPrice;
}

async function createNewUser(
	program,
	provider,
	usdcMint,
	usdcAmount,
	oracleInfos,
	wallet
) {
	let walletFlag = true;
	if (wallet == undefined) {
		const kp = new web3.Keypair();
		const sig = await provider.connection.requestAirdrop(kp.publicKey, 10 ** 9);
		await provider.connection.confirmTransaction(sig);
		wallet = new Wallet(kp);
		walletFlag = false;
	}

	console.log('wallet:', walletFlag);
	const usdcAta = await mockUserUSDCAccount(
		usdcMint,
		usdcAmount,
		provider,
		wallet.publicKey
	);

	const clearingHouse = new Admin({
		connection: provider.connection,
		wallet: wallet,
		programID: program.programId,
		opts: {
			commitment: 'confirmed',
		},
		activeUserId: 0,
		marketIndexes: [new BN(0), new BN(1)],
		bankIndexes: [new BN(0)],
		oracleInfos,
	});
	await clearingHouse.subscribe();

	if (walletFlag) {
		await clearingHouse.initialize(usdcMint.publicKey, true);
		await initializeQuoteAssetBank(clearingHouse, usdcMint.publicKey);
	}

	await clearingHouse.initializeUserAccountAndDepositCollateral(
		usdcAmount,
		usdcAta.publicKey
	);

	const clearingHouseUser = new ClearingHouseUser({
		clearingHouse,
		userAccountPublicKey: await clearingHouse.getUserAccountPublicKey(),
	});
	clearingHouseUser.subscribe();

	return [clearingHouse, clearingHouseUser];
}

async function fullClosePosition(clearingHouse, userPosition) {
	let limitPrice;
	if (userPosition.baseAssetAmount.lt(ZERO)) {
		limitPrice = new BN(100 * 1e13);
	} else {
		limitPrice = new BN(10 * 1e6);
	}

	return await clearingHouse.closePosition(new BN(0), limitPrice);
}

// if (limitPrice === undefined) {
// 	switch (direction) {
// 		case PositionDirection.LONG:
// 			console.log('longing..')
// 			limitPrice = new BN(100 * 1e13)

// 		case PositionDirection.SHORT:
// 			console.log('shorting..')
// 			limitPrice = new BN(10 * 1e6)
// 	}
// }

// let limitPrice;
// if (userPosition.baseAssetAmount.lt(ZERO)) {
// 	limitPrice = new BN(100 * 1e13)
// } else {
// 	limitPrice = new BN(10 * 1e6)
// }

describe('liquidity providing', () => {
	const provider = anchor.AnchorProvider.local(undefined, {
		preflightCommitment: 'confirmed',
		commitment: 'confirmed',
	});
	const connection = provider.connection;
	anchor.setProvider(provider);
	const chProgram = anchor.workspace.ClearingHouse as Program;

	async function _viewLogs(txsig) {
		const tx = await connection.getTransaction(txsig, {
			commitment: 'confirmed',
		});
		console.log('tx logs', tx.meta.logMessages);
	}
	async function delay(time) {
		await new Promise((resolve) => setTimeout(resolve, time));
	}

	// ammInvariant == k == x * y
	const ammInitialBaseAssetReserve = new BN(300).mul(new BN(1e13));
	const ammInitialQuoteAssetReserve = new BN(300).mul(new BN(1e13));

	const mantissaSqrtScale = new BN(Math.sqrt(MARK_PRICE_PRECISION.toNumber()));
	const stableAmmInitialQuoteAssetReserve = new anchor.BN(1 * 10 ** 13).mul(
		mantissaSqrtScale
	);
	const stableAmmInitialBaseAssetReserve = new anchor.BN(1 * 10 ** 13).mul(
		mantissaSqrtScale
	);

	const usdcAmount = new BN(1_000_000_000 * 1e6);

	let clearingHouse: Admin;
	const eventSubscriber = new EventSubscriber(connection, chProgram);
	eventSubscriber.subscribe();

	let usdcMint: web3.Keypair;

	let clearingHouseUser: ClearingHouseUser;
	let traderClearingHouse: Admin;
	let traderClearingHouseUser: ClearingHouseUser;

	let poorClearingHouse: Admin;
	let poorClearingHouseUser: ClearingHouseUser;

	let solusdc;
	let solusdc2;

	before(async () => {
		usdcMint = await mockUSDCMint(provider);

		solusdc2 = await mockOracle(1, -7); // make invalid
		solusdc = await mockOracle(1, -7); // make invalid
		const oracleInfos = [
			{ publicKey: solusdc, source: OracleSource.PYTH },
			{ publicKey: solusdc2, source: OracleSource.PYTH },
		];
		[clearingHouse, clearingHouseUser] = await createNewUser(
			chProgram,
			provider,
			usdcMint,
			usdcAmount,
			oracleInfos,
			provider.wallet
		);
		// used for trading / taking on baa
		await clearingHouse.initializeMarket(
			solusdc,
			ammInitialBaseAssetReserve,
			ammInitialQuoteAssetReserve,
			new BN(60 * 60)
		);
		await clearingHouse.updateLpCooldownTime(ZERO, new BN(0));
		await clearingHouse.updateMaxBaseAssetAmountRatio(new BN(0), 1);
		// await clearingHouse.updateMarketBaseAssetAmountStepSize(
		// 	new BN(0),
		// 	new BN(1)
		// );

		// second market -- used for funding ..
		await clearingHouse.initializeMarket(
			solusdc2,
			stableAmmInitialBaseAssetReserve,
			stableAmmInitialQuoteAssetReserve,
			new BN(0)
		);
		await clearingHouse.updateLpCooldownTime(new BN(1), new BN(0));
		await clearingHouse.updateAuctionDuration(new BN(0), new BN(0));

		[traderClearingHouse, traderClearingHouseUser] = await createNewUser(
			chProgram,
			provider,
			usdcMint,
			usdcAmount,
			oracleInfos,
			undefined
		);
		[poorClearingHouse, poorClearingHouseUser] = await createNewUser(
			chProgram,
			provider,
			usdcMint,
			QUOTE_PRECISION,
			oracleInfos,
			undefined
		);
	});

	after(async () => {
		await eventSubscriber.unsubscribe();

		await clearingHouse.unsubscribe();
		await clearingHouseUser.unsubscribe();

		await traderClearingHouse.unsubscribe();
		await traderClearingHouseUser.unsubscribe();

		await poorClearingHouse.unsubscribe();
		await poorClearingHouseUser.unsubscribe();
	});

	const lpCooldown = 1;

	it('burn with standardized baa', async () => {
		console.log('adding liquidity...');
		let market = clearingHouse.getMarketAccount(new BN(0));
		const lpAmount = new BN(100 * 1e13); // 100 / (100 + 300) = 1/4
		const _sig = await clearingHouse.addLiquidity(lpAmount, market.marketIndex);

		const stepSize = new BN(1 * 1e13);
		await clearingHouse.updateMarketBaseAssetAmountStepSize(ZERO, stepSize);

		let user = clearingHouseUser.getUserAccount();
		console.log('lpUser lpShares:', user.positions[0].lpShares.toString());
		console.log('lpUser baa:', user.positions[0].baseAssetAmount.toString());

		// some user goes long (lp should get a short)
		console.log('user trading...');

		market = clearingHouse.getMarketAccount(new BN(0));
		const tradeSize = new BN(5 * 1e13);

		// const [newQaa, newBaa] = calculateAmmReservesAfterSwap(
		// 	market.amm,
		// 	'base',
		// 	tradeSize.abs(),
		// 	SwapDirection.ADD
		// );
		// let quoteAmount = newQaa.sub(market.amm.quoteAssetReserve)
		// let lpQuoteAmount = quoteAmount.mul(lpAmount).div(market.amm.sqrtK)
		// console.log(
		// 	lpQuoteAmount.mul(QUOTE_PRECISION).div(AMM_RESERVE_PRECISION) .toString()
		// )

		const newPrice = await adjustOraclePostSwap(
			tradeSize,
			SwapDirection.ADD,
			market
		);
		const sig = await traderClearingHouse.openPosition(
			PositionDirection.SHORT,
			tradeSize,
			market.marketIndex,
			new BN(newPrice * MARK_PRICE_PRECISION.toNumber())
		);
		await _viewLogs(sig);

		// amm gets 33 (3/4 * 50 = 37.5)
		// lp gets stepSize (1/4 * 50 = 12.5 => 10 with remainder 2.5)
		// 2.5 / 12.5 = 0.2

		const traderUserAccount = traderClearingHouse.getUserAccount();
		const position = traderUserAccount.positions[0];
		console.log(
			'trader position:',
			position.baseAssetAmount.toString(),
			position.quoteAssetAmount.toString()
		);

		console.log('removing liquidity...');
		const _txSig = await clearingHouse.settleLP(
			await clearingHouse.getUserAccountPublicKey(),
			market.marketIndex
		);
		await _viewLogs(_txSig);

		user = clearingHouseUser.getUserAccount();
		const lpPosition = user.positions[0];

		console.log(
			'lp tokens, baa, qaa:',
			lpPosition.lpShares.toString(),
			lpPosition.baseAssetAmount.toString(),
			lpPosition.quoteAssetAmount.toString(),
			// lpPosition.unsettledPnl.toString(),
			lpPosition.lastNetBaseAssetAmountPerLp.toString(),
			lpPosition.lastNetQuoteAssetAmountPerLp.toString()
		);

		// assert(lpPosition.lpShares.eq(new BN(0)));
		assert(user.positions[0].baseAssetAmount.eq(new BN(10000000000000))); // lp is long
		assert(user.positions[0].quoteAssetAmount.eq(new BN(-1233600)));
		// assert(user.positions[0].unsettledPnl.eq(new BN(900)));
		// remainder goes into the last
		assert(
			user.positions[0].lastNetBaseAssetAmountPerLp.eq(new BN(100000000000))
		);
		assert(user.positions[0].lastNetQuoteAssetAmountPerLp.eq(new BN(-12336)));

		market = await clearingHouse.getMarketAccount(ZERO);
		console.log(
			market.amm.marketPositionPerLp.quoteAssetAmount.toString(),
			market.amm.marketPositionPerLp.baseAssetAmount.toString()
		);
		assert(
			market.amm.marketPositionPerLp.baseAssetAmount.eq(new BN(125000000000))
		);
		assert(market.amm.marketPositionPerLp.quoteAssetAmount.eq(new BN(-12336)));

		// remove
		console.log('removing liquidity...');
		await clearingHouse.removeLiquidity(ZERO);

		console.log('closing trader ...');
		await adjustOraclePostSwap(tradeSize, SwapDirection.REMOVE, market);
		const _sigg = await fullClosePosition(
			traderClearingHouse,
			traderUserAccount.positions[0]
		);
		// await _viewLogs(_sigg);

		const traderUserAccount2 =
			traderClearingHouse.getUserAccount().positions[0];
		console.log(
			traderUserAccount2.lpShares.toString(),
			traderUserAccount2.baseAssetAmount.toString(),
			traderUserAccount2.quoteAssetAmount.toString()
		);

		console.log('closing lp ...');
		console.log(user.positions[0].baseAssetAmount.div(new BN(1e13)).toString());
		await adjustOraclePostSwap(
			user.positions[0].baseAssetAmount,
			SwapDirection.ADD,
			market
		);

		const _ttxsig = await fullClosePosition(clearingHouse, user.positions[0]);
		// await _viewLogs(ttxsig);

		await clearingHouse.updateMarketBaseAssetAmountStepSize(ZERO, new BN(1));

		const user2 = clearingHouseUser.getUserAccount();
		const position2 = user2.positions[0];
		console.log(
			position2.lpShares.toString(),
			position2.baseAssetAmount.toString(),
			position2.quoteAssetAmount.toString()
		);
		console.log('done!');
	});

	it('settles lp', async () => {
		console.log('adding liquidity...');

		const market = clearingHouse.getMarketAccount(new BN(0));
		const _sig = await clearingHouse.addLiquidity(
			new BN(100 * 1e13),
			market.marketIndex
		);
		await delay(lpCooldown + 1000);

		let user = clearingHouseUser.getUserAccount();
		console.log(user.positions[0].lpShares.toString());

		// some user goes long (lp should get a short)
		console.log('user trading...');
		const tradeSize = new BN(5 * 1e13);
		try {
			await adjustOraclePostSwap(tradeSize, SwapDirection.REMOVE, market);
			const _txsig = await traderClearingHouse.openPosition(
				PositionDirection.LONG,
				tradeSize,
				market.marketIndex,
				new BN(100 * 1e13)
			);
			await _viewLogs(_txsig);
		} catch (e) {
			console.log(e);
		}

		const trader = traderClearingHouse.getUserAccount();
		console.log('trader size', trader.positions[0].baseAssetAmount.toString());

		const [settledLPPosition, _] = clearingHouseUser.getSettledLPPosition(ZERO);

		console.log('settling...');
		try {
			const _txsigg = await clearingHouse.settleLP(
				await clearingHouse.getUserAccountPublicKey(),
				ZERO
			);
			await _viewLogs(_txsigg);
		} catch (e) {
			console.log(e);
		}
		user = await clearingHouseUser.getUserAccount();
		const position = user.positions[0];

		// gets a short on settle
		console.log(
			'simulated settle position:',
			settledLPPosition.baseAssetAmount.toString(),
			settledLPPosition.quoteAssetAmount.toString(),
			settledLPPosition.quoteEntryAmount.toString()
		);

		// gets a short on settle
		console.log(
			position.baseAssetAmount.toString(),
			position.quoteAssetAmount.toString(),
			position.quoteEntryAmount.toString()
		);

		assert(settledLPPosition.baseAssetAmount.eq(position.baseAssetAmount));
		assert(settledLPPosition.quoteAssetAmount.eq(position.quoteAssetAmount));
		assert(settledLPPosition.quoteEntryAmount.eq(position.quoteEntryAmount));

		assert(position.baseAssetAmount.lt(ZERO));
		assert(position.quoteAssetAmount.gt(ZERO));
		assert(position.lpShares.gt(ZERO));

		console.log('removing liquidity...');
		const _txSig = await clearingHouse.removeLiquidity(market.marketIndex);
		await _viewLogs(_txSig);

		user = clearingHouseUser.getUserAccount();
		const lpPosition = user.positions[0];
		const lpTokenAmount = lpPosition.lpShares;
		assert(lpTokenAmount.eq(ZERO));

		console.log(
			'lp position:',
			lpPosition.baseAssetAmount.toString(),
			lpPosition.quoteAssetAmount.toString()
		);

		console.log('closing trader ...');
		await adjustOraclePostSwap(tradeSize, SwapDirection.REMOVE, market);
		const _txsig = await fullClosePosition(
			traderClearingHouse,
			trader.positions[0]
		);
		await _viewLogs(_txsig);

		const traderPosition = traderClearingHouse.getUserAccount().positions[0];
		console.log(
			'trader position:',
			traderPosition.baseAssetAmount.toString(),
			traderPosition.quoteAssetAmount.toString()
		);

		console.log('closing lp ...');
		const market2 = clearingHouse.getMarketAccount(ZERO);
		await adjustOraclePostSwap(
			user.positions[0].baseAssetAmount,
			SwapDirection.ADD,
			market2
		);
		await fullClosePosition(clearingHouse, user.positions[0]);

		console.log('done!');
	});

	it('provides and removes liquidity', async () => {
		let market = clearingHouse.getMarketAccount(0);
		const prevSqrtK = market.amm.sqrtK;
		const prevbar = market.amm.baseAssetReserve;
		const prevqar = market.amm.quoteAssetReserve;

		console.log('adding liquidity...');
		try {
			const _txsig = await clearingHouse.addLiquidity(
				new BN(100 * AMM_RESERVE_PRECISION),
				market.marketIndex
			);
		} catch (e) {
			console.error(e);
		}
		await delay(lpCooldown + 1000);

		market = clearingHouse.getMarketAccount(0);
		console.log(
			'sqrtK:',
			prevSqrtK.toString(),
			'->',
			market.amm.sqrtK.toString()
		);
		console.log(
			'baseAssetReserve:',
			prevbar.toString(),
			'->',
			market.amm.baseAssetReserve.toString()
		);
		console.log(
			'quoteAssetReserve:',
			prevqar.toString(),
			'->',
			market.amm.quoteAssetReserve.toString()
		);

		// k increases = more liquidity
		assert(prevSqrtK.lt(market.amm.sqrtK));
		assert(prevqar.lt(market.amm.quoteAssetReserve));
		assert(prevbar.lt(market.amm.baseAssetReserve));

		const lpShares = clearingHouseUser.getUserAccount().positions[0].lpShares;
		console.log('lpShares:', lpShares.toString());
		assert(lpShares.gt(ZERO));

		console.log('removing liquidity...');
		const _txSig = await clearingHouse.removeLiquidity(market.marketIndex);
		await clearingHouse.fetchAccounts();
		market = clearingHouse.getMarketAccount(0);
		const user = clearingHouseUser.getUserAccount();
		const lpTokenAmount = user.positions[0].lpShares;
		console.log('lp token amount:', lpTokenAmount.toString());
		assert(lpTokenAmount.eq(ZERO));

		console.log('asset reserves:');
		console.log(prevSqrtK.toString(), market.amm.sqrtK.toString());
		console.log(prevbar.toString(), market.amm.baseAssetReserve.toString());
		console.log(prevqar.toString(), market.amm.quoteAssetReserve.toString());

		const errThreshold = new BN(500000);
		assert(prevSqrtK.eq(market.amm.sqrtK));
		assert(
			prevbar.sub(market.amm.baseAssetReserve).abs().lte(errThreshold),
			prevbar.sub(market.amm.baseAssetReserve).abs().toString()
		);
		assert(
			prevqar.sub(market.amm.quoteAssetReserve).abs().lte(errThreshold),
			prevqar.sub(market.amm.quoteAssetReserve).abs().toString()
		);
		assert(prevSqrtK.eq(market.amm.sqrtK));
	});

	it('mints too many lp tokens', async () => {
		console.log('adding liquidity...');
		const market = clearingHouse.getMarketAccount(ZERO);
		try {
			const _sig = await poorClearingHouse.addLiquidity(
				market.amm.sqrtK.mul(new BN(5)),
				market.marketIndex
			);
			_viewLogs(_sig);
			assert(false);
		} catch (e) {
			console.error(e.message);
			assert(e.message.includes('0x1773')); // insufficient collateral
		}
	});

	it('provides lp, users shorts, removes lp, lp has long', async () => {
		console.log('adding liquidity...');

		const traderUserAccount3 = clearingHouse.getUserAccount();
		const position3 = traderUserAccount3.positions[0];
		console.log(
			'lp position:',
			position3.baseAssetAmount.toString(),
			position3.quoteAssetAmount.toString()
		);

		const traderUserAccount0 = traderClearingHouse.getUserAccount();
		const position0 = traderUserAccount0.positions[0];
		console.log(
			'trader position:',
			position0.baseAssetAmount.toString(),
			position0.quoteAssetAmount.toString()
		);
		assert(position0.baseAssetAmount.eq(new BN('0')));

		const market = clearingHouse.getMarketAccount(new BN(0));
		console.log(
			'market.amm.netBaseAssetAmount:',
			market.amm.netBaseAssetAmount.toString()
		);
		assert(market.amm.netBaseAssetAmount.eq(new BN('0')));
		const _sig = await clearingHouse.addLiquidity(
			new BN(100 * 1e13),
			market.marketIndex
		);
		// await delay(lpCooldown + 1000);

		let user = clearingHouseUser.getUserAccount();
		console.log('lpUser lpShares:', user.positions[0].lpShares.toString());
		console.log('lpUser baa:', user.positions[0].baseAssetAmount.toString());

		// some user goes long (lp should get a short)
		console.log('user trading...');
		const tradeSize = new BN(40 * 1e13);
		const newPrice = await adjustOraclePostSwap(
			tradeSize,
			SwapDirection.ADD,
			market
		);
		try {
			const _txsig = await traderClearingHouse.openPosition(
				PositionDirection.SHORT,
				tradeSize,
				market.marketIndex,
				new BN(newPrice * MARK_PRICE_PRECISION.toNumber())
			);
		} catch (e) {
			console.error(e);
		}

		await traderClearingHouse.fetchAccounts();
		const market1 = clearingHouse.getMarketAccount(new BN(0));
		console.log(
			'market1.amm.netBaseAssetAmount:',
			market1.amm.netBaseAssetAmount.toString()
		);
		const ammLpRatio =
			market1.amm.userLpShares.toNumber() / market1.amm.sqrtK.toNumber();

		console.log('amm ratio:', ammLpRatio, '(', 40 * ammLpRatio, ')');

		assert(market1.amm.netBaseAssetAmount.eq(new BN('-300000000000000')));

		const traderUserAccount = traderClearingHouse.getUserAccount();
		// console.log(traderUserAccount);
		const position = traderUserAccount.positions[0];
		console.log(
			'trader position:',
			position.baseAssetAmount.toString(),
			position.quoteAssetAmount.toString()
		);

		console.log('removing liquidity...');
		const _txSig = await clearingHouse.removeLiquidity(market.marketIndex);
		await _viewLogs(_txSig);

		user = clearingHouseUser.getUserAccount();
		const lpPosition = user.positions[0];
		const lpTokenAmount = lpPosition.lpShares;

		console.log(
			'lp tokens',
			lpTokenAmount.toString(),
			'baa, qaa',
			lpPosition.baseAssetAmount.toString(),
			lpPosition.quoteAssetAmount.toString()
			// lpPosition.unsettledPnl.toString()
		);

		assert(lpTokenAmount.eq(new BN(0)));
		assert(user.positions[0].baseAssetAmount.eq(new BN('100000000000000'))); // lp is long
		assert(user.positions[0].quoteAssetAmount.eq(new BN(-9550786)));

		console.log('closing trader ...');
		await adjustOraclePostSwap(tradeSize, SwapDirection.REMOVE, market);
		await fullClosePosition(
			traderClearingHouse,
			traderUserAccount.positions[0]
		);

		console.log('closing lp ...');
		console.log(user.positions[0].baseAssetAmount.div(new BN(1e13)).toString());
		await adjustOraclePostSwap(
			user.positions[0].baseAssetAmount,
			SwapDirection.ADD,
			market
		);
		await fullClosePosition(clearingHouse, user.positions[0]);

		const user2 = clearingHouseUser.getUserAccount();
		const position2 = user2.positions[0];
		console.log(
			position2.lpShares.toString(),
			position2.baseAssetAmount.toString(),
			position2.quoteAssetAmount.toString()
		);

		console.log('done!');
	});

	it('provides lp, users longs, removes lp, lp has short', async () => {
		const market = clearingHouse.getMarketAccount(ZERO);

		console.log('adding liquidity...');
		const _sig = await clearingHouse.addLiquidity(
			new BN(100 * 1e13),
			market.marketIndex
		);
		// await delay(lpCooldown + 1000);

		// some user goes long (lp should get a short)
		console.log('user trading...');
		const tradeSize = new BN(40 * 1e13);
		const newPrice0 = await adjustOraclePostSwap(
			tradeSize,
			SwapDirection.REMOVE,
			market
		);
		const _txsig = await traderClearingHouse.openPosition(
			PositionDirection.LONG,
			tradeSize,
			market.marketIndex,
			new BN(newPrice0 * MARK_PRICE_PRECISION.toNumber())
		);

		const position = traderClearingHouse.getUserAccount().positions[0];
		console.log(
			'trader position:',
			position.baseAssetAmount.toString(),
			position.quoteAssetAmount.toString()
		);

		console.log('removing liquidity...');
		const _txSig = await clearingHouse.removeLiquidity(market.marketIndex);
		await _viewLogs(_txSig);

		const user = clearingHouseUser.getUserAccount();
		const lpPosition = user.positions[0];
		const lpTokenAmount = lpPosition.lpShares;

		console.log('lp tokens', lpTokenAmount.toString());
		console.log(
			'baa, qaa, qea',
			lpPosition.baseAssetAmount.toString(),
			lpPosition.quoteAssetAmount.toString(),
			lpPosition.quoteEntryAmount.toString()

			// lpPosition.unsettledPnl.toString()
		);

		assert(lpTokenAmount.eq(ZERO));
		assert(user.positions[0].baseAssetAmount.eq(new BN('-100000000000000'))); // lp is short
		assert(user.positions[0].quoteAssetAmount.eq(new BN('11940739')));

		console.log('closing trader...');
		await adjustOraclePostSwap(tradeSize, SwapDirection.ADD, market);
		await fullClosePosition(traderClearingHouse, position);

		console.log('closing lp ...');
		await adjustOraclePostSwap(
			user.positions[0].baseAssetAmount,
			SwapDirection.REMOVE,
			market
		);
		await fullClosePosition(clearingHouse, lpPosition);

		await clearingHouse.fetchAccounts();
		await clearingHouseUser.fetchAccounts();
		const user2 = clearingHouseUser.getUserAccount();
		const lpPosition2 = user2.positions[0];

		console.log('lp tokens', lpPosition2.lpShares.toString());
		console.log(
			'lp position for market',
			lpPosition2.marketIndex.toNumber(),
			':\n',
			'baa, qaa, qea',
			lpPosition2.baseAssetAmount.toString(),
			lpPosition2.quoteAssetAmount.toString(),
			lpPosition2.quoteEntryAmount.toString()
		);
		assert(lpPosition2.baseAssetAmount.eq(ZERO));

		console.log('done!');
	});

	it('lp burns a partial position', async () => {
		const market = clearingHouse.getMarketAccount(0);

		console.log('adding liquidity...');
		await clearingHouse.addLiquidity(
			new BN(100).mul(AMM_RESERVE_PRECISION),
			market.marketIndex
		);
		// await delay(lpCooldown + 1000);

		await clearingHouse.fetchAccounts();
		await clearingHouseUser.fetchAccounts();

		const user0 = clearingHouse.getUserAccount();
		const position0 = user0.positions[0];
		console.log(
			'assert LP has 0 position in market index',
			market.marketIndex.toNumber(),
			':',
			position0.baseAssetAmount.toString(),
			position0.quoteAssetAmount.toString()
		);
		console.log(position0.lpShares.toString());

		const baa0 = position0.baseAssetAmount;
		const qaa0 = position0.quoteAssetAmount;
		assert(baa0.eq(ZERO));
		assert(qaa0.eq(new BN('2237738')));

		console.log('user trading...');
		const tradeSize = new BN(40 * 1e13);
		const newPrice = await adjustOraclePostSwap(
			tradeSize,
			SwapDirection.ADD,
			market
		);
		await traderClearingHouse.openPosition(
			PositionDirection.SHORT,
			tradeSize,
			market.marketIndex,
			new BN(newPrice * MARK_PRICE_PRECISION.toNumber())
		);

		console.log('removing liquidity...');
		let user = clearingHouse.getUserAccount();
		let position = user.positions[0];

		const fullShares = position.lpShares;
		const halfShares = position.lpShares.div(new BN(2));
		const otherHalfShares = fullShares.sub(halfShares);

		try {
			const _txSig = await clearingHouse.removeLiquidity(
				market.marketIndex,
				halfShares
			);
		} catch (e) {
			console.log(e);
		}
		await clearingHouse.fetchAccounts();
		user = clearingHouse.getUserAccount();
		position = user.positions[0];
		console.log(
			'lp first half burn:',
			user.positions[0].baseAssetAmount.toString(),
			user.positions[0].quoteAssetAmount.toString(),
			user.positions[0].lpShares.toString()
		);

		const baa = user.positions[0].baseAssetAmount;
		const qaa = user.positions[0].quoteAssetAmount;
		assert(baa.eq(new BN(100000000000000)));
		assert(qaa.eq(new BN(-6860363)));

		console.log('removing the other half of liquidity');
		await clearingHouse.removeLiquidity(market.marketIndex, otherHalfShares);

		user = clearingHouse.getUserAccount();
		console.log(
			'lp second half burn:',
			user.positions[0].baseAssetAmount.toString(),
			user.positions[0].quoteAssetAmount.toString(),
			user.positions[0].lpShares.toString()
		);
		// lp is already settled so full burn baa is already in baa
		assert(user.positions[0].lpShares.eq(ZERO));

		console.log('closing trader ...');
		await adjustOraclePostSwap(tradeSize, SwapDirection.REMOVE, market);
		// await traderClearingHouse.closePosition(new BN(0));
		const trader = traderClearingHouse.getUserAccount();
		const _txsig = await fullClosePosition(
			traderClearingHouse,
			trader.positions[0]
		);

		console.log('closing lp ...');
		await adjustOraclePostSwap(baa, SwapDirection.ADD, market);
		await fullClosePosition(clearingHouse, user.positions[0]);
	});
	return;

	it('lp gets paid in funding (todo)', async () => {
		const market = clearingHouse.getMarketAccount(new BN(1));
		const marketIndex = market.marketIndex;

		console.log('adding liquidity to market ', marketIndex.toNumber(), '...');
		try {
			const _sig = await clearingHouse.addLiquidity(
				new BN(100_000).mul(new BN(1e13)),
				marketIndex
			);
		} catch (e) {
			console.error(e);
		}
		await delay(lpCooldown + 1000);

		console.log('user trading...');
		// const trader0 = traderClearingHouse.getUserAccount();
		const tradeSize = new BN(100).mul(AMM_RESERVE_PRECISION);

		const newPrice = await adjustOraclePostSwap(
			tradeSize,
			SwapDirection.ADD,
			market
		);
		console.log(
			'market',
			marketIndex.toNumber(),
			'post trade price:',
			newPrice
		);
		try {
			const _txig = await traderClearingHouse.openPosition(
				PositionDirection.LONG,
				tradeSize,
				marketIndex,
				new BN(newPrice * MARK_PRICE_PRECISION.toNumber())
			);
		} catch (e) {
			console.error(e);
		}

		console.log('updating funding rates');
		const _txsig = await clearingHouse.updateFundingRate(solusdc2, marketIndex);

		console.log('removing liquidity...');
		try {
			const _txSig = await clearingHouse.removeLiquidity(marketIndex);
			_viewLogs(_txSig);
		} catch (e) {
			console.log(e);
		}
		await clearingHouse.fetchAccounts();

		const user = clearingHouseUser.getUserAccount();
		// const feePayment = new BN(1300000);
		// const fundingPayment = new BN(900000);

		// dont get paid in fees bc the sqrtk is so big that fees dont get given to the lps
		// TODO
		// assert(user.positions[1].unsettledPnl.eq(fundingPayment.add(feePayment)));
		const position1 = user.positions[1];
		console.log(
			'lp position:',
			position1.baseAssetAmount.toString(),
			position1.quoteAssetAmount.toString(),
			'vs step size:',
			market.amm.baseAssetAmountStepSize.toString()
		);
		assert(user.positions[1].baseAssetAmount.eq(ZERO)); // lp has no position
		assert(
			user.positions[1].baseAssetAmount
				.abs()
				.lt(market.amm.baseAssetAmountStepSize)
		);
		// const trader = traderClearingHouse.getUserAccount();
		// await adjustOraclePostSwap(
		// 	trader.positions[1].baseAssetAmount,
		// 	SwapDirection.ADD,
		// 	market
		// );
		// await traderClearingHouse.closePosition(market.marketIndex); // close lp position

		// console.log('closing lp ...');
		// console.log(user.positions[1].baseAssetAmount.toString());
		// await adjustOraclePostSwap(
		// 	user.positions[1].baseAssetAmount,
		// 	SwapDirection.REMOVE,
		// 	market
		// );
	});

	// // TODO
	// it('provides and removes liquidity too fast', async () => {
	// 	const market = clearingHouse.getMarketAccount(0);

	// 	const lpShares = new BN(100 * AMM_RESERVE_PRECISION);
	// 	const addLpIx = await clearingHouse.getAddLiquidityIx(
	// 		lpShares,
	// 		market.marketIndex
	// 	);
	// 	const removeLpIx = await clearingHouse.getRemoveLiquidityIx(
	// 		market.marketIndex,
	// 		lpShares
	// 	);

	// 	const tx = new web3.Transaction().add(addLpIx).add(removeLpIx);
	// 	try {
	// 		await provider.sendAll([{ tx }]);
	// 		assert(false);
	// 	} catch (e) {
	// 		console.error(e);
	// 		assert(e.message.includes('0x17ce'));
	// 	}
	// });

	// it('removes liquidity when market position is small', async () => {
	// 	console.log('adding liquidity...');
	// 	await clearingHouse.addLiquidity(usdcAmount, new BN(0));
	//
	// 	console.log('user trading...');
	// 	await traderClearingHouse.openPosition(
	// 		PositionDirection.LONG,
	// 		new BN(1 * 1e6),
	// 		new BN(0)
	// 	);
	//
	// 	console.log('removing liquidity...');
	// 	await clearingHouse.removeLiquidity(new BN(0));
	//
	// 	const user = clearingHouse.getUserAccount();
	// 	const position = user.positions[0];
	//
	// 	// small loss
	// 	assert(position.unsettledPnl.lt(ZERO));
	// 	// no position
	// 	assert(position.baseAssetAmount.eq(ZERO));
	// 	assert(position.quoteAssetAmount.eq(ZERO));
	// });
	//
	// uncomment when settle fcn is ready

	/* it('adds additional liquidity to an already open lp', async () => {
		console.log('adding liquidity...');
		const lp_amount = new BN(300 * 1e6);
		const _txSig = await clearingHouse.addLiquidity(lp_amount, new BN(0));

		console.log(
			'tx logs',
			(await connection.getTransaction(txsig, { commitment: 'confirmed' })).meta
				.logMessages
		);

		const init_user = clearingHouseUser.getUserAccount();
		await clearingHouse.addLiquidity(lp_amount, new BN(0));
		const user = clearingHouseUser.getUserAccount();

		const init_tokens = init_user.positions[0].lpTokens;
		const tokens = user.positions[0].lpTokens;
		console.log(init_tokens.toString(), tokens.toString());
		assert(init_tokens.lt(tokens));

		await clearingHouse.removeLiquidity(new BN(0));
	}); */

	/* it('settles an lps position', async () => {
        console.log('adding liquidity...');
        await clearingHouse.addLiquidity(usdcAmount, new BN(0));

        let user = clearingHouse.getUserAccount();
        const baa = user.positions[0].baseAssetAmount;
        const qaa = user.positions[0].quoteAssetAmount;
        const upnl = user.positions[0].unsettledPnl;

		console.log('user trading...');
		await traderClearingHouse.openPosition(
			PositionDirection.SHORT,
			new BN(115 * 1e5),
			new BN(0)
		);

		console.log('settling...');
		await traderClearingHouse.settleLP(
			await clearingHouse.getUserAccountPublicKey(),
			new BN(0)
		);

		user = clearingHouse.getUserAccount();
		const position = user.positions[0];
		const post_baa = position.baseAssetAmount;
		const post_qaa = position.quoteAssetAmount;
		const post_upnl = position.unsettledPnl;

		// they got the market position + upnl
		console.log(baa.toString(), post_baa.toString());
		console.log(qaa.toString(), post_qaa.toString());
		console.log(upnl.toString(), post_upnl.toString());
		assert(!post_baa.eq(baa));
		assert(post_qaa.gt(qaa));
		assert(!post_upnl.eq(upnl));

		// other sht was updated
		const market = clearingHouse.getMarketAccount(new BN(0));
		assert(market.amm.netBaseAssetAmount.eq(position.lastNetBaseAssetAmount));
		assert(
			market.amm.totalFeeMinusDistributions.eq(
				position.lastTotalFeeMinusDistributions
			)
		);

		const _txSig = await clearingHouse.removeLiquidity(new BN(0));

		console.log('done!');
	}); */

	/* it('simulates a settle via sdk', async () => {
		const userPosition2 = clearingHouse.getUserAccount().positions[0];
		console.log(
			userPosition2.baseAssetAmount.toString(),
			userPosition2.quoteAssetAmount.toString(),
			userPosition2.unsettledPnl.toString()
		);

		console.log('add lp ...');
		await clearingHouse.addLiquidity(usdcAmount, new BN(0));

		console.log('user trading...');
		await traderClearingHouse.openPosition(
			PositionDirection.SHORT,
			new BN(115 * 1e5),
			new BN(0)
		);

		const [settledPosition, result] = clearingHouseUser.getSettledLPPosition(
			new BN(0)
		);

		console.log('settling...');
		const _txSig = await traderClearingHouse.settleLP(
			await clearingHouse.getUserAccountPublicKey(),
			new BN(0)
		);
		console.log(
			'tx logs',
			(await connection.getTransaction(txsig, { commitment: 'confirmed' })).meta
				.logMessages
		);
		const userPosition = clearingHouse.getUserAccount().positions[0];

		console.log(
			userPosition.baseAssetAmount.toString(),
			settledPosition.baseAssetAmount.toString(),

			userPosition.quoteAssetAmount.toString(),
			settledPosition.quoteAssetAmount.toString(),

			userPosition.unsettledPnl.toString(),
			settledPosition.unsettledPnl.toString()
		);
		assert(result == SettleResult.RECIEVED_MARKET_POSITION);
		assert(userPosition.baseAssetAmount.eq(settledPosition.baseAssetAmount));
		assert(userPosition.quoteAssetAmount.eq(settledPosition.quoteAssetAmount));
		assert(userPosition.unsettledPnl.eq(settledPosition.unsettledPnl));
	}); */
});
