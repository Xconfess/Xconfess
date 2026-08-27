/**
 * parameter.encoder.ts
 *
 * Single authoritative Soroban ScVal encoding path for the xConfess backend.
 * ContractService delegates all argument encoding here — there is no duplicate
 * logic in contract.service.ts.
 *
 * Supported types
 * ───────────────
 *  • string   → ScVal string
 *  • u64      → ScVal u64  (JS number or bigint)
 *  • bool     → ScVal bool
 *  • bytes    → ScVal bytes  (Buffer or hex string)
 *  • address  → ScVal address  (Stellar G… public key)
 *  • map      → ScVal map  (Record<string, ContractArg>)
 *  • vec      → ScVal vec  (ContractArg[])
 *  • ScVal    → passed through unchanged
 */

import * as StellarSDK from '@stellar/stellar-sdk';

// ─── Public types ────────────────────────────────────────────────────────────

export type ScalarContractArg =
  | { type: 'string'; value: string }
  | { type: 'u64'; value: number | bigint }
  | { type: 'bool'; value: boolean }
  | { type: 'bytes'; value: Buffer | string }
  | { type: 'address'; value: string };

export type ComplexContractArg =
  | { type: 'map'; value: Record<string, ContractArg> }
  | { type: 'vec'; value: ContractArg[] };

/** A fully-typed contract argument. Pass raw ScVal to skip encoding. */
export type ContractArg =
  | ScalarContractArg
  | ComplexContractArg
  | StellarSDK.xdr.ScVal;

// ─── Scalar helpers (exported for direct use & tests) ────────────────────────

export function encodeStringParam(val: string): StellarSDK.xdr.ScVal {
  return StellarSDK.nativeToScVal(val, { type: 'string' });
}

export function encodeU64Param(val: number | bigint): StellarSDK.xdr.ScVal {
  return StellarSDK.nativeToScVal(val, { type: 'u64' });
}

export function encodeBytesParam(val: Buffer | string): StellarSDK.xdr.ScVal {
  const buf = typeof val === 'string' ? Buffer.from(val, 'hex') : val;
  return StellarSDK.nativeToScVal(buf, { type: 'bytes' });
}

export function encodeBoolParam(val: boolean): StellarSDK.xdr.ScVal {
  return StellarSDK.nativeToScVal(val, { type: 'bool' });
}

export function encodeAddressParam(val: string): StellarSDK.xdr.ScVal {
  return StellarSDK.nativeToScVal(new StellarSDK.Address(val), {
    type: 'address',
  });
}

// ─── Complex helpers ─────────────────────────────────────────────────────────

export function encodeVecParam(items: ContractArg[]): StellarSDK.xdr.ScVal {
  return StellarSDK.xdr.ScVal.scvVec(items.map(encodeContractArg));
}

export function encodeMapParam(
  entries: Record<string, ContractArg>,
): StellarSDK.xdr.ScVal {
  const mapEntries = Object.entries(entries).map(
    ([k, v]) =>
      new StellarSDK.xdr.ScMapEntry({
        key: encodeStringParam(k),
        val: encodeContractArg(v),
      }),
  );
  return StellarSDK.xdr.ScVal.scvMap(mapEntries);
}

// ─── Primary encoding entry-point ────────────────────────────────────────────

/**
 * Encode a single ContractArg to an ScVal.
 * Raw ScVal objects are passed through unchanged so callers that already hold
 * an ScVal (e.g. anchorConfession) don't need to unwrap/re-wrap them.
 */
export function encodeContractArg(arg: ContractArg): StellarSDK.xdr.ScVal {
  // Already an ScVal — pass through.
  if (arg instanceof StellarSDK.xdr.ScVal) {
    return arg;
  }

  switch (arg.type) {
    case 'string':
      return encodeStringParam(arg.value);
    case 'u64':
      return encodeU64Param(arg.value);
    case 'bool':
      return encodeBoolParam(arg.value);
    case 'bytes':
      return encodeBytesParam(arg.value);
    case 'address':
      return encodeAddressParam(arg.value);
    case 'vec':
      return encodeVecParam(arg.value);
    case 'map':
      return encodeMapParam(arg.value);
    default: {
      // Exhaustiveness guard — avoid interpolating `never` in template literals (restrict-template-expressions).
      const u = arg as unknown as { type?: string };
      throw new Error(
        `Unsupported contract arg type: ${String(u.type ?? 'unknown')}`,
      );
    }
  }
}

/**
 * Encode an array of ContractArgs — the shape ContractService passes to
 * contract.call().
 */
export function encodeContractArgs(
  args: ContractArg[],
): StellarSDK.xdr.ScVal[] {
  return args.map(encodeContractArg);
}
