// src/stellar/__tests__/contract.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import { ContractService } from '../contract.service';
import { StellarConfigService } from '../stellar-config.service';
import { TransactionBuilderService } from '../transaction-builder.service';
import {
  StellarTimeoutError,
  StellarMalformedTransactionError,
} from '../utils/stellar-error.handler';
import { InvokeContractDto } from '../dto/invoke-contract.dto';
import * as encoder from '../utils/parameter.encoder';
import { DeploymentMetadataService } from '../services/deployment-metadata.service';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const VALID_CONTRACT_ID =
  'CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR';
const VALID_SIGNER_SECRET =
  'SCS5KNRWMGTYHLXX6QHBCLIGGSERWUOO3N5EF4EPW5OO23S6MW3NHJID';
const VALID_SOURCE_ACCOUNT =
  'GACRG7PJ62DGGUXXVA3XVTAAZGMFMHEIYNN7MUT56LBXC4WW6KKDOPM2';

/** Minimal stub for a successful Soroban submit result. */
const MOCK_SUBMIT_RESULT = {
  hash: 'abc123def456',
  success: true,
  successful: true,
  result_xdr: null,
};

/** Minimal mock operation returned by Contract.call(). */
const MOCK_OPERATION = { type: 'invokeHostFunction' } as any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSuccessfulTxBuilderSpies(
  txBuilderService: TransactionBuilderService,
) {
  jest.spyOn(txBuilderService, 'buildTransaction').mockResolvedValue({} as any);
  jest.spyOn(txBuilderService, 'signTransaction').mockReturnValue({} as any);
  jest
    .spyOn(txBuilderService, 'submitTransaction')
    .mockResolvedValue(MOCK_SUBMIT_RESULT as any);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ContractService', () => {
  let service: ContractService;
  let module: TestingModule;
  let txBuilderService: TransactionBuilderService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
      ],
      providers: [
        ContractService,
        StellarConfigService,
        TransactionBuilderService,
        {
          provide: DeploymentMetadataService,
          useValue: {
            getMetadata: jest.fn().mockReturnValue(null),
            getAllContractIds: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
    txBuilderService = module.get(TransactionBuilderService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── invocationFromAllowlistedDto ────────────────────────────────────────────

  describe('invocationFromAllowlistedDto', () => {
    it('maps anchor_confession to configured contract and typed args', () => {
      const stellarConfig = module.get(StellarConfigService);
      jest.spyOn(stellarConfig, 'getContractId').mockReturnValue('CC_TEST');

      const dto = {
        operation: 'anchor_confession' as const,
        confessionHash: 'ab'.repeat(32),
        timestamp: 99,
        sourceAccount: 'G_SIGNER',
      } satisfies InvokeContractDto;

      const inv = service.invocationFromAllowlistedDto(dto, 'G_SIGNER');

      expect(inv).toEqual({
        contractId: 'CC_TEST',
        functionName: 'anchor_confession',
        args: [
          { type: 'bytes', value: Buffer.from(dto.confessionHash, 'hex') },
          { type: 'u64', value: 99 },
        ],
        sourceAccount: 'G_SIGNER',
      });
    });
  });

  // ── invokeContract — encoder delegation ────────────────────────────────────

  describe('invokeContract — shared encoder delegation', () => {
    it('delegates arg encoding to encodeContractArgs from parameter.encoder', async () => {
      const encodeSpy = jest.spyOn(encoder, 'encodeContractArgs');
      const contractCallSpy = jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      buildSuccessfulTxBuilderSpies(txBuilderService);

      const args: encoder.ContractArg[] = [
        { type: 'bytes', value: Buffer.from('deadbeef', 'hex') },
        { type: 'u64', value: 1_700_000_000 },
      ];

      await service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'anchor_confession',
          args,
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );

      // The shared encoder must be called with exactly the typed args.
      expect(encodeSpy).toHaveBeenCalledWith(args);

      // The encoded ScVals — not the raw ContractArg objects — reach contract.call.
      const callArgs = contractCallSpy.mock.calls[0];
      const functionName = callArgs[0];
      const scvArgs = callArgs.slice(1);
      expect(functionName).toBe('anchor_confession');
      // Each spread argument must be an ScVal, not a plain ContractArg object.
      for (const scv of scvArgs) {
        expect(scv).toBeInstanceOf(StellarSDK.xdr.ScVal);
      }
    });

    it('returns hash and success from the transaction result', async () => {
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      buildSuccessfulTxBuilderSpies(txBuilderService);

      const result = await service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'test_fn',
          args: [{ type: 'string', value: 'hello' }],
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );

      expect(result.hash).toBe(MOCK_SUBMIT_RESULT.hash);
      expect(result.success).toBe(true);
    });

    it('passes encoded args in the same order as the input args array', async () => {
      const contractCallSpy = jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      buildSuccessfulTxBuilderSpies(txBuilderService);

      const args: encoder.ContractArg[] = [
        { type: 'string', value: 'first' },
        { type: 'u64', value: 1 },
        { type: 'bool', value: true },
      ];

      await service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'multi_arg_fn',
          args,
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );

      // Expect exactly 3 encoded ScVals in the same positional order.
      const spreadArgs = contractCallSpy.mock.calls[0].slice(
        1,
      ) as StellarSDK.xdr.ScVal[];
      expect(spreadArgs).toHaveLength(3);
      expect(StellarSDK.scValToNative(spreadArgs[0])).toBe('first');
      expect(Number(StellarSDK.scValToNative(spreadArgs[1]))).toBe(1);
      expect(StellarSDK.scValToNative(spreadArgs[2])).toBe(true);
    });

    it('handles an empty args list without calling encodeContractArgs with content', async () => {
      const encodeSpy = jest.spyOn(encoder, 'encodeContractArgs');
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      buildSuccessfulTxBuilderSpies(txBuilderService);

      await service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'no_args_fn',
          args: [],
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );

      expect(encodeSpy).toHaveBeenCalledWith([]);
    });

    it('passes raw ScVal args through the encoder unchanged', async () => {
      const rawScVal = StellarSDK.nativeToScVal('already-encoded', {
        type: 'string',
      });
      const contractCallSpy = jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      buildSuccessfulTxBuilderSpies(txBuilderService);

      await service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'passthrough_fn',
          args: [rawScVal],
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );

      const spreadArgs = contractCallSpy.mock.calls[0].slice(1);
      // The ScVal instance must be the exact same reference (passed through).
      expect(spreadArgs[0]).toBe(rawScVal);
    });
  });

  // ── Negative Paths & Error Handling ────────────────────────────────────────

  describe('Negative Paths & Error Handling', () => {
    it('times out a stalled invocation without leaving a timer behind', async () => {
      jest.useFakeTimers();
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      jest
        .spyOn(txBuilderService, 'buildTransaction')
        .mockResolvedValue({} as any);
      jest
        .spyOn(txBuilderService, 'signTransaction')
        .mockReturnValue({} as any);
      jest
        .spyOn(txBuilderService, 'submitTransaction')
        .mockReturnValue(new Promise(() => undefined));
      jest
        .spyOn(module.get(StellarConfigService), 'getConfig')
        .mockReturnValue({ rpcTimeoutMs: 25 } as any);

      const invocation = service.invokeContract(
        {
          contractId: VALID_CONTRACT_ID,
          functionName: 'test',
          args: [],
          sourceAccount: VALID_SOURCE_ACCOUNT,
        },
        VALID_SIGNER_SECRET,
      );
      const expectation = expect(invocation).rejects.toThrow(
        StellarTimeoutError,
      );

      await jest.advanceTimersByTimeAsync(25);
      await expectation;
      expect(jest.getTimerCount()).toBe(0);
      jest.useRealTimers();
    });

    it('should throw StellarTimeoutError when transaction times out', async () => {
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      jest
        .spyOn(txBuilderService, 'buildTransaction')
        .mockResolvedValue({} as any);
      jest
        .spyOn(txBuilderService, 'signTransaction')
        .mockReturnValue({} as any);
      jest
        .spyOn(txBuilderService, 'submitTransaction')
        .mockRejectedValue(new Error('Transaction timeout'));

      await expect(
        service.invokeContract(
          {
            contractId: VALID_CONTRACT_ID,
            functionName: 'test',
            args: [],
            sourceAccount: VALID_SOURCE_ACCOUNT,
          },
          VALID_SIGNER_SECRET,
        ),
      ).rejects.toThrow(StellarTimeoutError);
    });

    it('should throw StellarMalformedTransactionError on tx_bad_seq', async () => {
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      jest
        .spyOn(txBuilderService, 'buildTransaction')
        .mockResolvedValue({} as any);
      jest
        .spyOn(txBuilderService, 'signTransaction')
        .mockReturnValue({} as any);

      const badSeqError = {
        response: {
          data: {
            extras: {
              result_codes: { transaction: 'tx_bad_seq' },
            },
          },
        },
      };

      jest
        .spyOn(txBuilderService, 'submitTransaction')
        .mockRejectedValue(badSeqError);

      await expect(
        service.invokeContract(
          {
            contractId: VALID_CONTRACT_ID,
            functionName: 'test',
            args: [],
            sourceAccount: VALID_SOURCE_ACCOUNT,
          },
          VALID_SIGNER_SECRET,
        ),
      ).rejects.toThrow(StellarMalformedTransactionError);
    });

    it('wraps generic errors via handleStellarError', async () => {
      jest
        .spyOn(StellarSDK.Contract.prototype, 'call')
        .mockReturnValue(MOCK_OPERATION);
      jest
        .spyOn(txBuilderService, 'buildTransaction')
        .mockResolvedValue({} as any);
      jest
        .spyOn(txBuilderService, 'signTransaction')
        .mockReturnValue({} as any);
      jest
        .spyOn(txBuilderService, 'submitTransaction')
        .mockRejectedValue(new Error('unexpected failure'));

      await expect(
        service.invokeContract(
          {
            contractId: VALID_CONTRACT_ID,
            functionName: 'test',
            args: [],
            sourceAccount: VALID_SOURCE_ACCOUNT,
          },
          VALID_SIGNER_SECRET,
        ),
      ).rejects.toThrow();
    });
  });
});
