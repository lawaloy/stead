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

describe('tokenStore setSession memory-first publish', () => {
  beforeEach(async () => {
    store.clear();
    await tokenStore.clearToken();
    jest.clearAllMocks();
  });

  it('serves the new session from memory while SecureStore writes are still in flight', async () => {
    let allowWrites = false;
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const originalSet = mockSecureStore.setItemAsync;
    mockSecureStore.setItemAsync = jest.fn(
      async (key: string, value: string) => {
        if (!allowWrites) {
          await firstWrite;
        }
        store.set(key, value);
      },
    );

    const pending = tokenStore.setSession({
      token: 'hot-access',
      refreshToken: 'hot-refresh',
    });

    try {
      await expect(tokenStore.getToken()).resolves.toBe('hot-access');
      await expect(tokenStore.getRefreshToken()).resolves.toBe('hot-refresh');
      expect(store.size).toBe(0);

      allowWrites = true;
      releaseFirstWrite?.();
      await pending;
    } finally {
      mockSecureStore.setItemAsync = originalSet;
    }
  });
});
