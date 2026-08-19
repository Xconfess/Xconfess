import { act, renderHook, waitFor } from '@testing-library/react';
import { useMessageE2E } from '../useMessageE2E';
import apiClient from '@/app/lib/api/client';
import {
  generateMessageKeyPair,
  unwrapPrivateKeyWithPassphrase,
  wrapPrivateKeyWithPassphrase,
} from '@/app/lib/crypto/messageE2E';
import {
  loadLocalKeyPair,
  saveLocalKeyPair,
} from '@/app/lib/crypto/messageKeyStore';

jest.mock('@/app/lib/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('@/app/lib/crypto/messageE2E', () => ({
  buildThreadId: (confessionId: string, senderAnonId: string) =>
    `${confessionId}:${senderAnonId}`,
  decryptMessage: jest.fn(),
  encryptMessage: jest.fn(),
  generateMessageKeyPair: jest.fn(),
  isEncryptedPayload: jest.fn(() => true),
  unwrapPrivateKeyWithPassphrase: jest.fn(),
  wrapPrivateKeyWithPassphrase: jest.fn(),
}));

jest.mock('@/app/lib/crypto/messageKeyStore', () => ({
  loadLocalKeyPair: jest.fn(),
  saveLocalKeyPair: jest.fn(),
  deleteLocalKeyPair: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;
const mockPut = apiClient.put as jest.Mock;
const mockLoadLocalKeyPair = loadLocalKeyPair as jest.Mock;
const mockSaveLocalKeyPair = saveLocalKeyPair as jest.Mock;
const mockGenerateMessageKeyPair = generateMessageKeyPair as jest.Mock;
const mockUnwrapPrivateKeyWithPassphrase =
  unwrapPrivateKeyWithPassphrase as jest.Mock;
const mockWrapPrivateKeyWithPassphrase =
  wrapPrivateKeyWithPassphrase as jest.Mock;

const anonymousUserId = 'anon-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMessageE2E — first-run (brand-new identity)', () => {
  it('generates and registers a new key pair when no key exists anywhere', async () => {
    mockGet.mockResolvedValue({
      data: { anonymousUserId, publicKey: null, keyVersion: 0, hasBackup: false },
    });
    mockLoadLocalKeyPair.mockResolvedValue(null);
    mockGenerateMessageKeyPair.mockResolvedValue({
      publicKey: 'new-pub',
      privateKey: 'new-priv',
    });
    mockPut.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useMessageE2E());

    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.needsKeyRecovery).toBe(false);
    expect(result.current.keyError).toBeNull();
    expect(mockSaveLocalKeyPair).toHaveBeenCalledWith(
      anonymousUserId,
      { publicKey: 'new-pub', privateKey: 'new-priv' },
      0,
    );
    expect(mockPut).toHaveBeenCalledWith('/messages/keys', { publicKey: 'new-pub' });
  });
});

describe('useMessageE2E — lost local key on a device with a registered identity', () => {
  it('requires explicit recovery instead of silently generating and registering a new key', async () => {
    mockGet.mockResolvedValue({
      data: {
        anonymousUserId,
        publicKey: 'server-pub',
        keyVersion: 1,
        hasBackup: true,
      },
    });
    mockLoadLocalKeyPair.mockResolvedValue(null);

    const { result } = renderHook(() => useMessageE2E());

    await waitFor(() => expect(result.current.needsKeyRecovery).toBe(true));

    expect(result.current.isReady).toBe(false);
    // The critical assertion: no new key pair is silently generated or
    // registered, which would overwrite the server's public key and make
    // messages under the old key permanently unreadable.
    expect(mockGenerateMessageKeyPair).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('restoring from backup clears the recovery state and becomes ready', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/messages/keys/me') {
        return Promise.resolve({
          data: {
            anonymousUserId,
            publicKey: 'server-pub',
            keyVersion: 2,
            hasBackup: true,
          },
        });
      }
      if (url === '/messages/keys/backup') {
        return Promise.resolve({
          data: { encryptedKeyBackup: 'wrapped-blob', keyVersion: 2 },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    mockLoadLocalKeyPair.mockResolvedValue(null);
    mockUnwrapPrivateKeyWithPassphrase.mockResolvedValue('restored-priv');

    const { result } = renderHook(() => useMessageE2E());
    await waitFor(() => expect(result.current.needsKeyRecovery).toBe(true));

    await act(async () => {
      await result.current.restoreFromBackup('correct horse battery staple');
    });

    expect(result.current.needsKeyRecovery).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(result.current.keyError).toBeNull();
    expect(mockSaveLocalKeyPair).toHaveBeenCalledWith(
      anonymousUserId,
      { publicKey: 'server-pub', privateKey: 'restored-priv' },
      2,
    );
  });

  it('starting fresh generates a new key pair only after explicit confirmation', async () => {
    mockGet.mockResolvedValue({
      data: {
        anonymousUserId,
        publicKey: 'server-pub',
        keyVersion: 1,
        hasBackup: false,
      },
    });
    mockLoadLocalKeyPair.mockResolvedValue(null);
    mockGenerateMessageKeyPair.mockResolvedValue({
      publicKey: 'fresh-pub',
      privateKey: 'fresh-priv',
    });
    mockPut.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useMessageE2E());
    await waitFor(() => expect(result.current.needsKeyRecovery).toBe(true));

    await act(async () => {
      await result.current.startFreshKeys();
    });

    expect(result.current.needsKeyRecovery).toBe(false);
    expect(result.current.isReady).toBe(true);
    expect(mockPut).toHaveBeenCalledWith('/messages/keys', { publicKey: 'fresh-pub' });
  });

  it('never logs the recovery passphrase, on success or failure', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/messages/keys/me') {
        return Promise.resolve({
          data: {
            anonymousUserId,
            publicKey: 'server-pub',
            keyVersion: 1,
            hasBackup: true,
          },
        });
      }
      if (url === '/messages/keys/backup') {
        return Promise.resolve({
          data: { encryptedKeyBackup: 'wrapped-blob', keyVersion: 1 },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    mockLoadLocalKeyPair.mockResolvedValue(null);

    const secretPassphrase = 'super-secret-recovery-phrase';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Failure path: wrong passphrase.
    mockUnwrapPrivateKeyWithPassphrase.mockRejectedValueOnce(new Error('bad passphrase'));
    const { result } = renderHook(() => useMessageE2E());
    await waitFor(() => expect(result.current.needsKeyRecovery).toBe(true));

    await act(async () => {
      await expect(result.current.restoreFromBackup(secretPassphrase)).rejects.toThrow();
    });

    // Success path.
    mockUnwrapPrivateKeyWithPassphrase.mockResolvedValueOnce('restored-priv');
    await act(async () => {
      await result.current.restoreFromBackup(secretPassphrase);
    });

    const allLoggedArgs = [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
    expect(allLoggedArgs.some((entry) => entry?.includes(secretPassphrase))).toBe(false);

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe('useMessageE2E — matching local key', () => {
  it('becomes ready without recovery state when the local key matches the server', async () => {
    mockGet.mockResolvedValue({
      data: { anonymousUserId, publicKey: 'matching-pub', keyVersion: 0, hasBackup: false },
    });
    mockLoadLocalKeyPair.mockResolvedValue({
      anonymousUserId,
      publicKey: 'matching-pub',
      privateKey: 'matching-priv',
      keyVersion: 0,
    });

    const { result } = renderHook(() => useMessageE2E());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.needsKeyRecovery).toBe(false);
    expect(result.current.keyError).toBeNull();
    expect(mockGenerateMessageKeyPair).not.toHaveBeenCalled();
  });

  it('surfaces a keyError when the local key differs from the server public key', async () => {
    mockGet.mockResolvedValue({
      data: { anonymousUserId, publicKey: 'server-pub', keyVersion: 0, hasBackup: false },
    });
    mockLoadLocalKeyPair.mockResolvedValue({
      anonymousUserId,
      publicKey: 'stale-local-pub',
      privateKey: 'stale-local-priv',
      keyVersion: 0,
    });

    const { result } = renderHook(() => useMessageE2E());

    await waitFor(() => expect(result.current.keyError).not.toBeNull());
    expect(result.current.isReady).toBe(true);
    expect(result.current.needsKeyRecovery).toBe(false);
  });
});
