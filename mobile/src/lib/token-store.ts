import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'stead.jwt';
const memoryStore = new Map<string, string>();

const hasSecureStore = () =>
  typeof SecureStore.getItemAsync === 'function' &&
  typeof SecureStore.setItemAsync === 'function' &&
  typeof SecureStore.deleteItemAsync === 'function';

const getFallbackToken = () => {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return memoryStore.get(TOKEN_KEY) ?? null;
  }
};

const setFallbackToken = (token: string) => {
  try {
    globalThis.localStorage?.setItem(TOKEN_KEY, token);
    return;
  } catch {
    memoryStore.set(TOKEN_KEY, token);
  }
};

const clearFallbackToken = () => {
  try {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  } catch {
    memoryStore.delete(TOKEN_KEY);
  }
};

export const tokenStore = {
  async getToken() {
    if (!hasSecureStore()) return getFallbackToken();
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return getFallbackToken();
    }
  },
  async setToken(token: string) {
    if (!hasSecureStore()) {
      setFallbackToken(token);
      return;
    }
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
      setFallbackToken(token);
    }
  },
  async clearToken() {
    if (!hasSecureStore()) {
      clearFallbackToken();
      return;
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      clearFallbackToken();
    }
  },
};
