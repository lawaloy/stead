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

  it('writes and reads access and refresh tokens', async () => {
    await tokenStore.setSession({
      token: 'abc123',
      refreshToken: 'refresh-abc',
    });
    await expect(tokenStore.getToken()).resolves.toBe('abc123');
    await expect(tokenStore.getRefreshToken()).resolves.toBe('refresh-abc');
  });

  it('clears both access and refresh tokens', async () => {
    await tokenStore.setSession({
      token: 'abc123',
      refreshToken: 'refresh-abc',
    });
    await tokenStore.clearToken();
    await expect(tokenStore.getToken()).resolves.toBeNull();
    await expect(tokenStore.getRefreshToken()).resolves.toBeNull();
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
      await tokenStore.setSession({
        token: 'web-token',
        refreshToken: 'web-refresh',
      });
      await expect(tokenStore.getToken()).resolves.toBe('web-token');
      await expect(tokenStore.getRefreshToken()).resolves.toBe('web-refresh');
      await tokenStore.clearToken();
      await expect(tokenStore.getToken()).resolves.toBeNull();
      await expect(tokenStore.getRefreshToken()).resolves.toBeNull();
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
      await tokenStore.setSession({
        token: 'web-token',
        refreshToken: 'web-refresh',
      });
      await expect(tokenStore.getToken()).resolves.toBe('web-token');
      await expect(tokenStore.getRefreshToken()).resolves.toBe('web-refresh');
      await tokenStore.clearToken();
      await expect(tokenStore.getToken()).resolves.toBeNull();
      await expect(tokenStore.getRefreshToken()).resolves.toBeNull();
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
      mockSecureStore.deleteItemAsync = originalDelete;
    }
  });

  it('falls back to in-memory storage when localStorage throws', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(() => {
          throw new Error('localStorage blocked');
        }),
        setItem: jest.fn(() => {
          throw new Error('localStorage blocked');
        }),
        removeItem: jest.fn(() => {
          throw new Error('localStorage blocked');
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
      await tokenStore.setSession({
        token: 'memory-token',
        refreshToken: 'memory-refresh',
      });
      await expect(tokenStore.getToken()).resolves.toBe('memory-token');
      await expect(tokenStore.getRefreshToken()).resolves.toBe(
        'memory-refresh',
      );
      await tokenStore.clearToken();
      await expect(tokenStore.getToken()).resolves.toBeNull();
      await expect(tokenStore.getRefreshToken()).resolves.toBeNull();
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
      mockSecureStore.deleteItemAsync = originalDelete;
    }
  });
});
