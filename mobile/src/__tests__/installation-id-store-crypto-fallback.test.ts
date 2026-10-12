const secureStoreValues = new Map<string, string>();

const mockSecureStore: {
  getItemAsync?: (key: string) => Promise<string | null>;
  setItemAsync?: (key: string, value: string) => Promise<void>;
  deleteItemAsync?: (key: string) => Promise<void>;
} = {
  getItemAsync: jest.fn(
    async (key: string) => secureStoreValues.get(key) ?? null,
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStoreValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureStoreValues.delete(key);
  }),
};

const randomUUID = jest.fn();

jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-crypto', () => ({ randomUUID }));

const { installationIdStore } = jest.requireActual(
  '../lib/installation-id-store',
) as typeof import('../lib/installation-id-store');

describe('installationIdStore crypto fallback', () => {
  const originalCrypto = globalThis.crypto;
  const fallbackId = 'aaaaaaaa-4bbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(async () => {
    await installationIdStore.clearId();
    secureStoreValues.clear();
    randomUUID.mockReset();
    jest.mocked(mockSecureStore.setItemAsync!).mockClear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('falls back to Web Crypto when expo-crypto cannot mint an id', async () => {
    randomUUID.mockImplementation(() => {
      throw new Error('expo-crypto unavailable');
    });
    const webRandomUUID = jest.fn().mockReturnValue(fallbackId);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: webRandomUUID },
    });

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(fallbackId);
    expect(webRandomUUID).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'stead.installation-id',
      fallbackId,
    );
  });

  it('rethrows when neither expo-crypto nor Web Crypto can mint an id', async () => {
    const error = new Error('expo-crypto unavailable');
    randomUUID.mockImplementation(() => {
      throw error;
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    await expect(installationIdStore.getOrCreateId()).rejects.toBe(error);
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
