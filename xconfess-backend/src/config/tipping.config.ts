import { registerAs } from '@nestjs/config';

const DEFAULT_STALE_THRESHOLD_MINUTES = 30;

export default registerAs('tipping', () => ({
  tipVerificationStaleThresholdMinutes: parseInt(
    process.env.TIP_VERIFICATION_STALE_THRESHOLD_MINUTES ??
      String(DEFAULT_STALE_THRESHOLD_MINUTES),
    10,
  ),

  // Tip amount bounds — must be consistent with contract and frontend
  minTipAmount: Number(process.env.MIN_TIP_AMOUNT) || 0.1,
  maxTipAmount: Number(process.env.MAX_TIP_AMOUNT) || 10_000,
  tipPrecision: Number(process.env.TIP_PRECISION) || 7,
}));
