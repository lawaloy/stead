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

describe('installationIdStore', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(async () => {
    originalLocalStorage = globalThis.localStorage;
    await installationIdStore.clearId();
    secureStoreValues.clear();
    randomUUID.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('generates, persists, and reuses one UUIDv4 identifier', async () => {
    const first = await installationIdStore.getOrCreateId();
    const second = await installationIdStore.getOrCreateId();

    expect(first).toBe('0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77');
    expect(second).toBe(first);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'stead.installation-id',
      first,
    );
  });

  it('restores an existing identifier without rotating it', async () => {
    secureStoreValues.set(
      'stead.installation-id',
      '908de9d7-7c80-4275-a255-a5f6e1f7246f',
    );

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(
      '908de9d7-7c80-4275-a255-a5f6e1f7246f',
    );
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('coalesces concurrent cold-start callers onto one identifier', async () => {
    let resolveGet: ((value: string | null) => void) | undefined;
    const gatedGet = new Promise<string | null>((resolve) => {
      resolveGet = resolve;
    });
    const originalGet = mockSecureStore.getItemAsync;
    mockSecureStore.getItemAsync = jest.fn(async () => gatedGet);

    try {
      const pending = Promise.all([
        installationIdStore.getOrCreateId(),
        installationIdStore.getOrCreateId(),
        installationIdStore.getOrCreateId(),
      ]);
      resolveGet?.(null);
      const ids = await pending;

      expect(new Set(ids)).toEqual(
        new Set(['0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77']),
      );
      expect(randomUUID).toHaveBeenCalledTimes(1);
    } finally {
      mockSecureStore.getItemAsync = originalGet;
    }
  });

  it('replaces corrupted persisted values', async () => {
    secureStoreValues.set('stead.installation-id', 'not-a-device-id');

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(
      '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to browser storage when secure storage rejects', async () => {
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
    mockSecureStore.getItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });
    mockSecureStore.setItemAsync = jest.fn(async () => {
      throw new TypeError('SecureStore unavailable on web');
    });

    try {
      const installationId = await installationIdStore.getOrCreateId();
      expect(browserValues.get('stead.installation-id')).toBe(installationId);
    } finally {
      mockSecureStore.getItemAsync = originalGet;
      mockSecureStore.setItemAsync = originalSet;
    }
  });
});
