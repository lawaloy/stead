const store = new Map<string, string>();

const mockSecureStore: {
  getItemAsync?: (key: string) => Promise<string | null>;
  setItemAsync?: (key: string, value: string) => Promise<void>;
  deleteItemAsync?: (key: string) => Promise<void>;
} = {
  getItemAsync: jest.fn(async (key: string) => store.get(key) || null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    store.delete(key);
  }),
};

jest.mock('expo-secure-store', () => mockSecureStore);

const { tokenStore } = jest.requireActual(
  '../lib/token-store',
) as typeof import('../lib/token-store');

describe('tokenStore SecureStore read rejection fallback', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(async () => {
    originalLocalStorage = globalThis.localStorage;
    store.clear();
    await tokenStore.clearToken();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('restores tokens from localStorage when SecureStore reads reject and session memory is empty', async () => {
    const webStore = new Map<string, string>([
      ['stead.jwt', 'fallback-access'],
      ['stead.refresh', 'fallback-refresh'],
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((key: string) => webStore.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          webStore.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          webStore.delete(key);
        }),
      },
    });
    const originalGet = mockSecureStore.getItemAsync;
    mockSecureStore.getItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });

    try {
      await expect(tokenStore.getToken()).resolves.toBe('fallback-access');
      await expect(tokenStore.getRefreshToken()).resolves.toBe(
        'fallback-refresh',
      );
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('stead.jwt');
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
        'stead.refresh',
      );
    } finally {
      mockSecureStore.getItemAsync = originalGet;
    }
  });
});
