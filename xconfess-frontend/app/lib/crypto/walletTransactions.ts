import * as Stellar from '@stellar/stellar-sdk';
import { unlockEmbeddedWallet } from './embeddedWallet';

const horizonUrl = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? Stellar.Networks.PUBLIC : Stellar.Networks.TESTNET;

export function getWalletServer() { return new Stellar.Horizon.Server(horizonUrl); }

export async function getNativeBalance(publicKey: string) {
  const account = await getWalletServer().loadAccount(publicKey);
  const native = account.balances.find((balance) => balance.asset_type === 'native');
  return native && 'balance' in native ? Number(native.balance) : 0;
}

export async function sendXlm(params: { destination: string; amount: string; pin: string; memo?: string }) {
  const destination = Stellar.Keypair.fromPublicKey(params.destination).publicKey();
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error('Enter a valid XLM amount');
  const sender = await unlockEmbeddedWallet(params.pin);
  const account = await getWalletServer().loadAccount(sender.publicKey());
  let builder = new Stellar.TransactionBuilder(account, { fee: Stellar.BASE_FEE, networkPassphrase: network })
    .addOperation(Stellar.Operation.payment({ destination, asset: Stellar.Asset.native(), amount: amount.toFixed(7) }));
  if (params.memo?.trim()) builder = builder.addMemo(Stellar.Memo.text(params.memo.trim().slice(0, 28)));
  const signed = builder.setTimeout(60).build();
  signed.sign(sender);
  const result = await getWalletServer().submitTransaction(signed);
  return result.hash;
}

export type WalletActivity = { id: string; type: 'sent' | 'received'; amount: number; asset: string; createdAt: string; transactionHash: string };
export async function getRecentActivity(publicKey: string): Promise<WalletActivity[]> {
  const records = await getWalletServer().payments().forAccount(publicKey).order('desc').limit(10).call();
  return records.records.flatMap((record: any) => {
    if (record.type !== 'payment' || record.asset_type !== 'native') return [];
    const amount = Number(record.amount);
    return [{ id: String(record.id), type: record.to === publicKey ? 'received' : 'sent', amount: record.to === publicKey ? amount : -amount, asset: 'XLM', createdAt: record.created_at, transactionHash: record.transaction_hash }];
  });
}