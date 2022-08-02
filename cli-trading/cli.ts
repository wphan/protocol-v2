#!/usr/bin/env node

/*

need to run in repo root first (rust):
    cargo build

Usage (run in ./cli-trading):
    ts-node cli.ts [command]

*/

import { program } from 'commander';
import log from 'loglevel';

import {
    configSet,
    configGet,
    configInit,
} from './commands/config';
import {
    initializeUser,
    depositCollateral,
    withdrawCollateral,
    placeOrder,
    viewMarketInfo,
    viewPortfolio,
    viewUserPortfolio,
    closePositions,
    settleEverything,
    bulkOrderTest,
} from './commands/clearingHouse';

log.setLevel(log.levels.INFO);


const configcmd = program.command('config');
configcmd
    .command('init')
    .action(configInit);
configcmd
    .command('set')
    .argument('<key>', 'the config key e.g. env, url, keypair')
    .argument('<value>')
    .action(configSet);
configcmd
    .command('get')
    .action(configGet);

const initUserCmd = program.command('initializeUser');
initUserCmd.action(initializeUser);

const depositCmd = program.command('deposit');
depositCmd.action(depositCollateral);

const withdrawCmd = program.command('withdraw');
withdrawCmd.action(withdrawCollateral);

const placeOrderCmd = program.command('placeOrder');
placeOrderCmd.action(placeOrder);

const marketCmd = program.command('viewMarketInfo');
marketCmd.action(viewMarketInfo)

const viewPortfolioCmd = program.command('viewPortfolio');
viewPortfolioCmd.action(viewPortfolio)

const viewUserPortfolioCmd = program.command('viewUserPortfolio');
viewUserPortfolioCmd.action(viewUserPortfolio);

const closePositionsCmd = program.command('closePositions');
closePositionsCmd.action(closePositions)

const settleEverythingCmd = program.command('settleEverything');
settleEverythingCmd.action(settleEverything)

const bulkPlaceTest = program.command('bulkOrderTest');
bulkPlaceTest.action(bulkOrderTest);

program.parse(process.argv);