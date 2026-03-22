import { tokenStore } from '../lib/token-store';

const store = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => store.get(key) || null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    store.delete(key);
  }),
}));

describe('tokenStore', () => {
  it('writes and reads token', async () => {
    await tokenStore.setToken('abc123');
    await expect(tokenStore.getToken()).resolves.toBe('abc123');
  });

  it('clears token', async () => {
    await tokenStore.setToken('abc123');
    await tokenStore.clearToken();
    await expect(tokenStore.getToken()).resolves.toBeNull();
  });
});
