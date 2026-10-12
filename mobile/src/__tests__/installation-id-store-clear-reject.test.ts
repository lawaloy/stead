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

const randomUUID = jest
  .fn()
  .mockReturnValue('0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77');

jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-crypto', () => ({ randomUUID }));

const { installationIdStore } = jest.requireActual(
  '../lib/installation-id-store',
) as typeof import('../lib/installation-id-store');

describe('installationIdStore clearId SecureStore rejection', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(async () => {
    originalLocalStorage = globalThis.localStorage;
    await installationIdStore.clearId();
    secureStoreValues.clear();
    randomUUID.mockReset();
    randomUUID.mockReturnValue('0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77');
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('still drops the browser fallback when SecureStore delete rejects', async () => {
    const browserValues = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((key: string) => browserValues.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          browserValues.set(key, value);
        }),
        removeItem: jest.fn((key: string) => browserValues.delete(key)),
      },
    });
    const originalGet = mockSecureStore.getItemAsync;
    const originalSet = mockSecureStore.setItemAsync;
    const originalDelete = mockSecureStore.deleteItemAsync;
    mockSecureStore.getItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });
    mockSecureStore.setItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });
    mockSecureStore.deleteItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });

    try {
      const first = await installationIdStore.getOrCreateId();
      expect(first).toBe('0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77');
      expect(browserValues.get('stead.installation-id')).toBe(first);

      randomUUID.mockReturnValue('908de9d7-7c80-4275-a255-a5f6e1f7246f');
      await expect(installationIdStore.clearId()).resolves.toBeUndefined();
      expect(browserValues.has('stead.installation-id')).toBe(false);

      await expect(installationIdStore.getOrCreateId()).resolves.toBe(
        '908de9d7-7c80-4275-a255-a5f6e1f7246f',
      );
      expect(randomUUID).toHaveBeenCalledTimes(2);
      expect(browserValues.get('stead.installation-id')).toBe(
        '908de9d7-7c80-4275-a255-a5f6e1f7246f',
      );
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
      mockSecureStore.deleteItemAsync = originalDelete;
    }
  });
});
