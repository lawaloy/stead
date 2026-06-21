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

const { tokenStore } = jest.requireActual('../lib/token-store') as typeof import('../lib/token-store');

describe('tokenStore', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('writes and reads token', async () => {
    await tokenStore.setToken('abc123');
    await expect(tokenStore.getToken()).resolves.toBe('abc123');
  });

  it('clears token', async () => {
    await tokenStore.setToken('abc123');
    await tokenStore.clearToken();
    await expect(tokenStore.getToken()).resolves.toBeNull();
  });

  it('falls back to localStorage when secure store methods are unavailable', async () => {
    const webStore = new Map<string, string>();
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
    const originalSet = mockSecureStore.setItemAsync;
    const originalDelete = mockSecureStore.deleteItemAsync;
    mockSecureStore.getItemAsync = undefined;
    mockSecureStore.setItemAsync = undefined;
    mockSecureStore.deleteItemAsync = undefined;

    try {
      await tokenStore.setToken('web-token');
      await expect(tokenStore.getToken()).resolves.toBe('web-token');
      await tokenStore.clearToken();
      await expect(tokenStore.getToken()).resolves.toBeNull();
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
      mockSecureStore.deleteItemAsync = originalDelete;
    }
  });

  it('falls back to localStorage when secure store methods reject on web', async () => {
    const webStore = new Map<string, string>();
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
      await tokenStore.setToken('web-token');
      await expect(tokenStore.getToken()).resolves.toBe('web-token');
      await tokenStore.clearToken();
      await expect(tokenStore.getToken()).resolves.toBeNull();
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
      mockSecureStore.deleteItemAsync = originalDelete;
    }
  });
});
