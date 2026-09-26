import { BadRequestException } from '@nestjs/common';

/**
 * Tip amount bounds. Keep in sync with the anonymous tipping contract and the
 * frontend tip form.
 */
export const MIN_TIP_AMOUNT = 0.1;
export const MAX_TIP_AMOUNT = 10_000;
export const TIP_PRECISION = 7;

/**
 * Supported Stellar assets for tipping.
 * Currently only native XLM is supported (asset_type = 'native').
 * Asset codes and issuers are validated against this list.
 */
export const SUPPORTED_TIP_ASSETS = [
  {
    code: 'XLM',
    issuer: null, // native asset has no issuer
    assetType: 'native',
    precision: 7,
  },
] as const;

export type SupportedTipAsset = (typeof SUPPORTED_TIP_ASSETS)[number];

export const DEFAULT_TIP_ASSET: SupportedTipAsset = SUPPORTED_TIP_ASSETS[0];

/**
 * Validates that the given asset is supported for tipping.
 * @param assetCode The asset code (e.g., 'XLM')
 * @param assetIssuer The asset issuer (null for native)
 * @param assetType The asset type ('native' or 'credit_alphanum4'/'credit_alphanum12')
 * @returns The matched supported asset or throws BadRequestException
 */
export function validateTipAsset(
  assetCode: string,
  assetIssuer: string | null,
  assetType: string,
): SupportedTipAsset {
  const matched = SUPPORTED_TIP_ASSETS.find(
    (a) =>
      a.code.toLowerCase() === assetCode.toLowerCase() &&
      a.issuer === assetIssuer &&
      a.assetType === assetType,
  );

  if (!matched) {
    const supported = SUPPORTED_TIP_ASSETS.map((a) => a.code).join(', ');
    throw new BadRequestException(
      `Unsupported tip asset: ${assetCode}${assetIssuer ? ` (issuer: ${assetIssuer})` : ''}. Supported assets: ${supported}`,
    );
  }

  return matched;
}

/**
 * Validates tip amount precision against the asset's configured precision.
 * @param amount The tip amount as a number
 * @param assetPrecision The asset's decimal precision (e.g., 7 for XLM)
 * @throws Error if precision exceeds the asset's configured precision
 */
export function validateTipPrecision(amount: number, assetPrecision: number): void {
  const amountStr = amount.toString();
  const decimalPart = amountStr.includes('.') ? amountStr.split('.')[1] : '';
  if (decimalPart.length > assetPrecision) {
    throw new BadRequestException(
      `Tip amount has ${decimalPart.length} decimal places, maximum allowed is ${assetPrecision} for this asset`,
    );
  }
}

/**
 * Validates tip amount bounds and zero/negative values.
 * @param amount The tip amount as a number
 * @throws Error if amount is zero, negative, or out of bounds
 */
export function validateTipAmountBounds(amount: number): void {
  if (amount <= 0) {
    throw new BadRequestException('Tip amount must be positive (greater than zero)');
  }
  if (amount < MIN_TIP_AMOUNT) {
    throw new BadRequestException(
      `Tip amount ${amount} is below minimum of ${MIN_TIP_AMOUNT}`,
    );
  }
  if (amount > MAX_TIP_AMOUNT) {
    throw new BadRequestException(
      `Tip amount ${amount} exceeds maximum of ${MAX_TIP_AMOUNT}`,
    );
  }
}
