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
    stellar?: { platform?: string };
  }
}

type MobileWalletKit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let mobileWalletKit: MobileWalletKit | null = null;
let mobileWalletConnected = false;

function isMobileWalletBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (window.stellar?.platform === "mobile") return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function getMobileWalletKit(): Promise<MobileWalletKit> {
  if (mobileWalletKit) return mobileWalletKit;

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!projectId) {
    throw new FreighterError(
      "Mobile wallet connection is not configured. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to the frontend environment.",
    );
  }

  const [{ StellarWalletsKit }, { WalletConnectModule, WalletConnectTargetChain }] =
    await Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/wallet-connect"),
    ]);
  const { Networks: KitNetworks } = await import("@creit.tech/stellar-wallets-kit/types");
  const isMainnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet";

  const walletConnect = new WalletConnectModule({
    projectId,
    allowedChains: [
      isMainnet ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET,
    ],
    metadata: {
      name: "xConfess",
      description: "Anonymous confessions on Stellar",
      url: window.location.origin,
      icons: [`${window.location.origin}/branding/new.png`],
    },
  });

  StellarWalletsKit.init({
    modules: [walletConnect],
    network: isMainnet ? KitNetworks.PUBLIC : KitNetworks.TESTNET,
    authModal: { hideUnsupportedWallets: true, showInstallLabel: false },
  });
  mobileWalletKit = StellarWalletsKit;
  return StellarWalletsKit;
}

function networkLabel(network: string): string {
  return network.includes("Public Global") ? "PUBLIC_NETWORK" : "TESTNET_SOROBAN";
}

async function withWalletTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FreighterError("Wallet connection timed out. Open Freighter Mobile and try again.")),
      90_000,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
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
  return getFreighterClient() != null || isMobileWalletBrowser();
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
  if (mobileWalletConnected && mobileWalletKit) {
    const result = await mobileWalletKit.getNetwork();
    return networkLabel(result.networkPassphrase || result.network);
  }

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
  if (mobileWalletConnected && mobileWalletKit) {
    const { address } = await mobileWalletKit.getAddress();
    if (address) return address;
    throw new FreighterError("Freighter Mobile did not return a public key");
  }

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
  if (mobileWalletConnected && mobileWalletKit) {
    const result = await mobileWalletKit.signTransaction(xdr, {
      networkPassphrase,
    });
    if (result.signedTxXdr) return result.signedTxXdr;
    throw new FreighterError("Freighter Mobile did not return a signed transaction");
  }

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
  if (isMobileWalletBrowser()) {
    const kit = await getMobileWalletKit();
    const { address } = await withWalletTimeout(kit.authModal());
    if (!address) throw new FreighterError("Freighter Mobile did not return an address");
    mobileWalletConnected = true;
    return {
      publicKey: address,
      network: await freighterGetNetworkLabel(),
    };
  }

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
  if (mobileWalletConnected && mobileWalletKit) {
    await mobileWalletKit.disconnect();
    mobileWalletConnected = false;
    return;
  }

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
  if (isMobileWalletBrowser()) {
    if (!mobileWalletConnected || !mobileWalletKit) return null;
    try {
      const { address } = await mobileWalletKit.getAddress();
      return address
        ? { publicKey: address, network: await freighterGetNetworkLabel() }
        : null;
    } catch {
      return null;
    }
  }

  try {
    const connection = await checkFreighterConnection();
    if (!connection.isConnected && !isFreighterInstalled()) return null;
    return await freighterConnect();
  } catch {
    return null;
  }
}
