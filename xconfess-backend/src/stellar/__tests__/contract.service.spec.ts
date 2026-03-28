// src/stellar/__tests__/stellar.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ContractService } from '../contract.service';
import { StellarConfigService } from '../stellar-config.service';
import { TransactionBuilderService } from '../transaction-builder.service';
import {
  StellarTimeoutError,
  StellarMalformedTransactionError,
} from '../utils/stellar-error.handler';

describe('ContractService', () => {
  let service: ContractService;
  let module: TestingModule;
  let txBuilderService: TransactionBuilderService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ContractService,
        StellarConfigService,
        TransactionBuilderService,
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
    txBuilderService = module.get(TransactionBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encodeContractArgs', () => {
    it('should return args as-is (temporary placeholder)', () => {
      const args = ['foo', 123, true];
      expect(service['encodeContractArgs'](args)).toEqual(args);
    });
  });

  describe('Negative Paths & Error Handling', () => {
    it('should throw StellarTimeoutError when transaction times out', async () => {
      // Mock internal methods
      jest.spyOn(service as any, 'encodeContractArgs').mockReturnValue([]);
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
            contractId: 'CC...',
            functionName: 'test',
            args: [],
            sourceAccount: 'G...',
          },
          'S...',
        ),
      ).rejects.toThrow(StellarTimeoutError);
    });

    it('should throw StellarMalformedTransactionError on tx_bad_seq', async () => {
      jest.spyOn(service as any, 'encodeContractArgs').mockReturnValue([]);
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
            contractId: 'CC...',
            functionName: 'test',
            args: [],
            sourceAccount: 'G...',
          },
          'S...',
        ),
      ).rejects.toThrow(StellarMalformedTransactionError);
    });
  });
});
