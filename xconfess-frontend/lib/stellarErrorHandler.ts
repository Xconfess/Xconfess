import { toast } from "@/components/ui/use-toast";

/**
 * Standardized Stellar anchoring error feedback.
 * Maps low-level XDR/RPC errors to user-friendly messages.
 * Issue #681
 */

export interface StellarError {
  message: string;
  type: 'wallet' | 'signer' | 'network' | 'contract' | 'unknown';
  actionable?: string;
}

/**
 * Handles Stellar-related errors and shows a toast notification.
 * 
 * @param error - The caught error from Stellar SDK or wallet
 * @returns A normalized StellarError object
 */
export function handleStellarError(error: any): StellarError {
  const errorMessage = error?.message || String(error);
  const errorString = errorMessage.toLowerCase();
  
  let userMessage = "Stellar operation failed.";
  let type: StellarError['type'] = 'unknown';
  let actionable: string | undefined;

  // 1. Wallet errors (Installation, Locking, Connection)
  if (errorString.includes("freighter") || errorString.includes("wallet not found")) {
    userMessage = "Stellar wallet not detected.";
    type = 'wallet';
    actionable = "Please install the Freighter extension and ensure it is unlocked.";
  } else if (errorString.includes("public key") || errorString.includes("connect")) {
    userMessage = "Could not access wallet.";
    type = 'wallet';
    actionable = "Ensure your wallet is connected and try again.";
  }
  
  // 2. Signer failures (User rejection)
  else if (
    errorString.includes("user rejected") || 
    errorString.includes("declined") || 
    errorString.includes("cancel") ||
    errorString.includes("abort")
  ) {
    userMessage = "Transaction cancelled.";
    type = 'signer';
    actionable = "You must approve the transaction in your wallet to anchor your confession.";
  }

  // 3. Network issues (Connectivity, RPC, Horizon)
  else if (
    errorString.includes("network") || 
    errorString.includes("passphrase") || 
    errorString.includes("horizon") || 
    errorString.includes("rpc") ||
    errorString.includes("fetch")
  ) {
    userMessage = "Network connectivity issue.";
    type = 'network';
    actionable = "Check your internet connection and ensure your wallet is on the correct network (Testnet/Mainnet).";
  }

  // 4. Contract / Transaction errors (Duplicate, Balance, Timeout)
  else if (errorString.includes("duplicate")) {
    userMessage = "Already anchored.";
    type = 'contract';
    actionable = "This confession has already been recorded on the Stellar ledger.";
  } else if (errorString.includes("insufficient") || errorString.includes("balance") || errorString.includes("underfunded")) {
    userMessage = "Insufficient XLM balance.";
    type = 'wallet';
    actionable = "Your account needs a small amount of XLM to pay for transaction fees.";
  } else if (errorString.includes("timeout") || errorString.includes("expired")) {
    userMessage = "Transaction timed out.";
    type = 'network';
    actionable = "The network is congested. Please check your wallet history before retrying.";
  }

  // Structured logging for development and diagnostics
  console.error(`[Stellar ${type.toUpperCase()}] ${errorMessage}`, {
    type,
    userMessage,
    actionable,
    originalError: error
  });

  // Display actionable toast to the user
  toast({
    title: type === 'signer' ? "Action Cancelled" : "Stellar Transaction Error",
    description: actionable || userMessage,
    variant: type === 'signer' ? "default" : "destructive",
  });

  return {
    message: userMessage,
    type,
    actionable
  };
}
