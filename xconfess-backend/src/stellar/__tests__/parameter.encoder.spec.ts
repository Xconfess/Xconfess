import * as StellarSDK from '@stellar/stellar-sdk';
import {
  encodeStringParam,
  encodeU64Param,
  encodeBytesParam,
  encodeBoolParam,
  encodeAddressParam,
  encodeVecParam,
  encodeMapParam,
  encodeContractArg,
  encodeContractArgs,
  ContractArg,
} from '../utils/parameter.encoder';

describe('parameter.encoder', () => {
  describe('encodeStringParam', () => {
    it('encodes a string to ScVal', () => {
      const val = encodeStringParam('hello');
      expect(StellarSDK.scValToNative(val)).toBe('hello');
    });
  });

  describe('encodeU64Param', () => {
    it('encodes a number to u64 ScVal', () => {
      const val = encodeU64Param(42);
      expect(Number(StellarSDK.scValToNative(val))).toBe(42);
    });

    it('encodes a bigint to u64 ScVal', () => {
      const val = encodeU64Param(BigInt('9007199254740993'));
      expect(StellarSDK.scValToNative(val)).toBe(BigInt('9007199254740993'));
    });
  });

  describe('encodeBytesParam', () => {
    it('encodes a Buffer', () => {
      const buf = Buffer.from('deadbeef', 'hex');
      const val = encodeBytesParam(buf);
      const native = StellarSDK.scValToNative(val) as Buffer;
      expect(Buffer.compare(native, buf)).toBe(0);
    });

    it('encodes a hex string', () => {
      const val = encodeBytesParam('deadbeef');
      const native = StellarSDK.scValToNative(val) as Uint8Array;
      expect(Buffer.from(native).toString('hex')).toBe('deadbeef');
    });
  });

  describe('encodeBoolParam', () => {
    it('encodes true', () => {
      expect(StellarSDK.scValToNative(encodeBoolParam(true))).toBe(true);
    });
    it('encodes false', () => {
      expect(StellarSDK.scValToNative(encodeBoolParam(false))).toBe(false);
    });
  });

  describe('encodeAddressParam', () => {
    it('encodes a valid Stellar address', () => {
      const kp = StellarSDK.Keypair.random();
      const val = encodeAddressParam(kp.publicKey());
      const native = StellarSDK.scValToNative(val) as StellarSDK.Address;
      expect(native.toString()).toBe(kp.publicKey());
    });
  });

  describe('encodeVecParam', () => {
    it('encodes a vec of mixed scalar args', () => {
      const args: ContractArg[] = [
        { type: 'string', value: 'a' },
        { type: 'u64', value: 1 },
      ];
      const val = encodeVecParam(args);
      expect(val.switch().name).toBe('scvVec');
    });
  });

  describe('encodeMapParam', () => {
    it('encodes a map of string keys to scalar values', () => {
      const val = encodeMapParam({
        foo: { type: 'string', value: 'bar' },
        count: { type: 'u64', value: 7 },
      });
      expect(val.switch().name).toBe('scvMap');
      const entries = val.map();
      expect(entries).toHaveLength(2);
    });
  });

  describe('encodeContractArg', () => {
    it('passes through a raw ScVal unchanged', () => {
      const raw = StellarSDK.nativeToScVal('raw', { type: 'string' });
      expect(encodeContractArg(raw)).toBe(raw);
    });

    it('throws on an unknown type', () => {
      expect(() =>
        encodeContractArg({ type: 'unknown' as any, value: 'x' } as any),
      ).toThrow(/Unsupported contract arg type/);
    });
  });

  describe('encodeContractArgs — anchor_confession shape', () => {
    it('encodes the exact args used by anchorConfession()', () => {
      const hash =
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const ts = 1_700_000_000;

      const args: ContractArg[] = [
        { type: 'bytes', value: Buffer.from(hash, 'hex') },
        { type: 'u64', value: ts },
      ];

      const [bytesVal, u64Val] = encodeContractArgs(args);

      const decodedBytes = StellarSDK.scValToNative(bytesVal) as Uint8Array;
      expect(Buffer.from(decodedBytes).toString('hex')).toBe(hash);

      expect(Number(StellarSDK.scValToNative(u64Val))).toBe(ts);
    });
  });
});
