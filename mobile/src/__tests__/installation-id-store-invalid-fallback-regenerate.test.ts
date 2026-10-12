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

const generatedId = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
const randomUUID = jest.fn().mockReturnValue(generatedId);

jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-crypto', () => ({ randomUUID }));

const { installationIdStore } = jest.requireActual(
  '../lib/installation-id-store',
) as typeof import('../lib/installation-id-store');

describe('installationIdStore invalid browser fallback', () => {
  let originalLocalStorage: Storage | undefined;

  beforeEach(async () => {
    originalLocalStorage = globalThis.localStorage;
    await installationIdStore.clearId();
    secureStoreValues.clear();
    randomUUID.mockClear();
    jest.mocked(mockSecureStore.getItemAsync!).mockClear();
    jest.mocked(mockSecureStore.setItemAsync!).mockClear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('regenerates instead of reusing a non-UUID browser-stored identifier', async () => {
    const browserValues = new Map<string, string>([
      ['stead.installation-id', 'not-a-device-id'],
    ]);
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

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(
      generatedId,
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'stead.installation-id',
      generatedId,
    );
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(
      'stead.installation-id',
    );
  });
});
