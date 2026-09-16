import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { WalletNetwork } from './entities/wallet.entity';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const publicKey = Keypair.random().publicKey();
  const repository = { findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn((value) => Promise.resolve(value)) };
  const backupRepository = { findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn((value) => Promise.resolve(value)) };
  let service: WalletService;

  beforeEach(() => { jest.clearAllMocks(); service = new WalletService(repository as never, backupRepository as never); });

  it('registers only valid public keys', async () => {
    repository.findOne.mockResolvedValue(null);
    const result = await service.register(7, { publicKey, network: WalletNetwork.TESTNET });
    expect(result.publicKey).toBe(publicKey);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, publicKey }));
  });

  it('rejects invalid public keys', async () => {
    await expect(service.register(7, { publicKey: 'not-a-stellar-key' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not allow Friendbot when funding is not explicitly enabled', async () => {
    const previous = process.env.ENABLE_TESTNET_FUNDING;
    process.env.ENABLE_TESTNET_FUNDING = 'false';
    await expect(service.fundTestnet(7)).rejects.toBeInstanceOf(ForbiddenException);
    process.env.ENABLE_TESTNET_FUNDING = previous;
  });
});
