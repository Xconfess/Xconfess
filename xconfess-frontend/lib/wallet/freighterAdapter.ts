import {
  getAddress as getFreighterAddress,
  getNetwork as getFreighterNetwork,
  isConnected as checkFreighterConnection,
  requestAccess,
  signTransaction as signFreighterTransaction,
} from "@stellar/freighter-api";

/**
 * Canonical Freighter / browser extension integration.
 * Resolves both `window.freighterApi` and `window.freighter` to a single surface.
 */

export type FreighterClient = {
  getPublicKey: () => Promise<string>;
  getNetwork?: () => Promise<string>;
  signTransaction?: (xdr: string, opts?: unknown) => Promise<string>;
  disconnect?: () => Promise<void>;
};

declare global {
  interface Window {
    freighter?: FreighterClient;
    freighterApi?: FreighterClient;
  }
}

export class FreighterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FreighterError";
  }
}

export function getFreighterClient(): FreighterClient | null {
  if (typeof window === "undefined") return null;
  return window.freighterApi ?? window.freighter ?? null;
}

export function isFreighterInstalled(): boolean {
  return getFreighterClient() != null;
}

export function normalizeFreighterError(error: unknown): FreighterError {
  if (error instanceof FreighterError) return error;
  const msg = error instanceof Error ? error.message : String(error);
  return new FreighterError(
    msg.startsWith("Freighter") || msg.startsWith("Wallet")
      ? msg
      : `Wallet error: ${msg}`,
    error,
  );
}

export async function freighterGetNetworkLabel(): Promise<string> {
  try {
    const result = await getFreighterNetwork();
    if (!result.error && result.network) return result.network;
  } catch {
    /* Fall back to the legacy injected API below. */
  }

  const client = getFreighterClient();
  if (!client) return "UNKNOWN";
  try {
    const n = await client.getNetwork?.();
    if (typeof n === "string" && n.trim().length > 0) return n;
  } catch {
    /* user may have Freighter locked */
  }
  return "TESTNET_SOROBAN";
}

export async function freighterGetPublicKey(): Promise<string> {
  try {
    const result = await getFreighterAddress();
    if (!result.error && result.address) return result.address;
  } catch {
    /* Fall back to the legacy injected API below. */
  }

  const client = getFreighterClient();
  if (!client) {
    throw new FreighterError(
      "Freighter wallet is not installed. Please install it from https://www.freighter.app/",
    );
  }
  try {
    const pk = await client.getPublicKey();
    if (!pk) {
      throw new FreighterError("Failed to get public key from Freighter wallet");
    }
    return pk;
  } catch (e) {
    throw normalizeFreighterError(e);
  }
}

/**
 * Sign a transaction XDR using the same call shapes tipping and Soroban anchoring expect.
 */
export async function freighterSignTransaction(
  xdr: string,
  networkPassphrase: string,
): Promise<string> {
  try {
    const result = await signFreighterTransaction(xdr, {
      networkPassphrase,
    });
    if (!result.error && result.signedTxXdr) return result.signedTxXdr;
  } catch {
    /* Fall back to the legacy injected API below. */
  }

  const client = getFreighterClient();
  if (!client?.signTransaction) {
    throw new FreighterError("Freighter wallet is not installed");
  }

  const sign = client.signTransaction.bind(client) as (
    x: string,
    o?: unknown,
  ) => Promise<string>;

  const attempts: Array<() => Promise<string>> = [
    () => sign(xdr, { network: networkPassphrase }),
    () => sign(xdr, networkPassphrase),
  ];

  const label = await freighterGetNetworkLabel().catch(() => "");
  if (label && label !== "UNKNOWN") {
    attempts.push(() => sign(xdr, { network: label }));
  }

  let last: unknown;
  for (const run of attempts) {
    try {
      const out = await run();
      if (typeof out === "string" && out.length > 0) return out;
    } catch (e) {
      last = e;
    }
  }
  throw normalizeFreighterError(
    last ?? new Error("Failed to sign transaction"),
  );
}

export async function freighterConnect(): Promise<{
  publicKey: string;
  network: string;
}> {
  try {
    const result = await requestAccess();
    if (!result.error && result.address) {
      return {
        publicKey: result.address,
        network: await freighterGetNetworkLabel(),
      };
    }
  } catch {
    /* Fall back to the legacy injected API below. */
  }

  const publicKey = await freighterGetPublicKey();
  const network = await freighterGetNetworkLabel();
  return { publicKey, network };
}

export async function freighterDisconnect(): Promise<void> {
  const client = getFreighterClient();
  if (client?.disconnect) {
    try {
      await client.disconnect();
    } catch (e) {
      console.error("Error disconnecting wallet:", e);
    }
  }
}

export async function freighterGetWalletInfo(): Promise<{
  publicKey: string;
  network: string;
} | null> {
  try {
    const connection = await checkFreighterConnection();
    if (!connection.isConnected && !isFreighterInstalled()) return null;
    return await freighterConnect();
  } catch {
    return null;
  }
}
