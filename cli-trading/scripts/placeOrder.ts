import * as anchor from '@project-serum/anchor';
import { AnchorProvider } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { Admin, BN, BulkAccountLoader } from '@drift-labs/sdk'; //'../../sdk/src';

import dotenv = require('dotenv');
import { initialize } from '@drift-labs/sdk';//'../../sdk/src';
import {
   BASE_PRECISION,
   ClearingHouse,
   getMarketOrderParams,
   PositionDirection,
   QUOTE_PRECISION,
   ZERO,
} from '@drift-labs/sdk';//'../../sdk/src';
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
   console.log(clearingHouse?.getUserAccount(0)?.orders[0]);

   const marketOrderParams = getMarketOrderParams(
      new BN(0),
      PositionDirection.LONG,
      ZERO,
      BASE_PRECISION,
      false
   );
   console.log("placing order:");
   console.log(marketOrderParams);

   // await clearingHouse.cancelOrder(new BN(1));
   // await clearingHouse.placeOrder(marketOrderParams);
   // await clearingHouse.getOrderByUserId()

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
