// src/stellar/utils/key.validator.ts
// Security utility for validating Stellar keys

import * as StellarSDK from '@stellar/stellar-sdk';

export function isValidPublicKey(key: string): boolean {
  try {
    return StellarSDK.StrKey.isValidEd25519PublicKey(key);
  } catch {
    return false;
  }
}

export function isValidSecretKey(key: string): boolean {
  try {
    return StellarSDK.StrKey.isValidEd25519SecretSeed(key);
  } catch {
    return false;
  }
}
