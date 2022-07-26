import { Provider, utils } from '@project-serum/anchor';
import {
	ConfirmOptions,
	Signer,
	Transaction,
	TransactionSignature,
	Commitment,
	PublicKey,
} from '@solana/web3.js';

export type TxSigAndSlot = {
	txSig: TransactionSignature;
	slot: number;
};

export interface TxSender {
	provider: Provider;

	send(
		tx: Transaction,
		additionalSigners?: Array<Signer>,
		opts?: ConfirmOptions
	): Promise<TxSigAndSlot>;

	simulate(
		tx: Transaction,
		signers?: Array<Signer>,
		commitment?: Commitment,
		includeAccounts?: boolean | Array<PublicKey>
	): Promise<utils.rpc.SuccessfulTxSimulationResponse>;
}
