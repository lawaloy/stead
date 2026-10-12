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

describe('installationIdStore identifier shape', () => {
  beforeEach(async () => {
    await installationIdStore.clearId();
    secureStoreValues.clear();
    randomUUID.mockClear();
  });

  it('normalizes a persisted uppercase UUIDv4 before reuse', async () => {
    secureStoreValues.set(
      'stead.installation-id',
      '908DE9D7-7C80-4275-A255-A5F6E1F7246F',
    );

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(
      '908de9d7-7c80-4275-a255-a5f6e1f7246f',
    );
    expect(randomUUID).not.toHaveBeenCalled();
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('rotates a persisted non-v4 UUID instead of sending it as the device id', async () => {
    secureStoreValues.set(
      'stead.installation-id',
      '908de9d7-7c80-1275-a255-a5f6e1f7246f',
    );

    await expect(installationIdStore.getOrCreateId()).resolves.toBe(
      '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'stead.installation-id',
      '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
    );
  });
});
