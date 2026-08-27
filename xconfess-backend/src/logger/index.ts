export const logger = {
  info: (metadata: object, message: string) => {
    console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), ...metadata, message }));
  },
  warn: (metadata: object, message: string) => {
    console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), ...metadata, message }));
  },
  error: (metadata: object, message: string) => {
    console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), ...metadata, message }));
  }
};

/**
 * Specifically for Issue #783: Emits lag metrics for reconciliation
 */
export const emitLagMetric = (
  type: 'anchor' | 'tip',
  confessionId: string,
  txHash: string,
  createdAt: Date
) => {
  const lagMs = Date.now() - new Date(createdAt).getTime();
  const lagSeconds = Math.floor(lagMs / 1000);

  logger.info({
    metric: 'reconciliation_lag',
    type,
    confessionId,
    // Truncate hash to avoid huge logs, but keep enough for lookup
    txHash: txHash.length > 10 ? `${txHash.substring(0, 8)}...` : txHash,
    lagSeconds,
    isStale: lagSeconds > 300 // Threshold: 5 minutes
  }, `Reconciliation lag for ${type}: ${lagSeconds}s`);
};