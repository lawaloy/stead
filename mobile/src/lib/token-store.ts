import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'stead.jwt';
const REFRESH_TOKEN_KEY = 'stead.refresh';
const memoryStore = new Map<string, string>();

/** Process-local session mirror so API calls never race SecureStore I/O. */
const sessionMemory = {
  accessToken: null as string | null,
  refreshToken: null as string | null,
};

const hasSecureStore = () =>
  typeof SecureStore.getItemAsync === 'function' &&
  typeof SecureStore.setItemAsync === 'function' &&
  typeof SecureStore.deleteItemAsync === 'function';

const getFallback = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return memoryStore.get(key) ?? null;
  }
};

const setFallback = (key: string, value: string) => {
  try {
    globalThis.localStorage?.setItem(key, value);
    return;
  } catch {
    memoryStore.set(key, value);
  }
};

const clearFallback = (key: string) => {
  try {
    globalThis.localStorage?.removeItem(key);
    return;
  } catch {
    memoryStore.delete(key);
  }
};

const readValue = async (key: string) => {
  if (!hasSecureStore()) return getFallback(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return getFallback(key);
  }
};

const writeValue = async (key: string, value: string) => {
  if (!hasSecureStore()) {
    setFallback(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    setFallback(key, value);
  }
};

const deleteValue = async (key: string) => {
  if (!hasSecureStore()) {
    clearFallback(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    clearFallback(key);
  }
};

export type AuthSessionTokens = {
  token: string;
  refreshToken: string;
};

export const tokenStore = {
  async getToken() {
    if (sessionMemory.accessToken != null) return sessionMemory.accessToken;
    return readValue(ACCESS_TOKEN_KEY);
  },
  async setToken(token: string) {
    sessionMemory.accessToken = token;
    await writeValue(ACCESS_TOKEN_KEY, token);
  },
  async getRefreshToken() {
    if (sessionMemory.refreshToken != null) return sessionMemory.refreshToken;
    return readValue(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(refreshToken: string) {
    sessionMemory.refreshToken = refreshToken;
    await writeValue(REFRESH_TOKEN_KEY, refreshToken);
  },
  async setSession(session: AuthSessionTokens) {
    // Publish to memory first so interceptors can attach Authorization before
    // SecureStore I/O finishes (native iOS was racing dual writes → 401 logout).
    sessionMemory.accessToken = session.token;
    sessionMemory.refreshToken = session.refreshToken;
    await writeValue(ACCESS_TOKEN_KEY, session.token);
    await writeValue(REFRESH_TOKEN_KEY, session.refreshToken);
  },
  async clearToken() {
    sessionMemory.accessToken = null;
    sessionMemory.refreshToken = null;
    await Promise.all([
      deleteValue(ACCESS_TOKEN_KEY),
      deleteValue(REFRESH_TOKEN_KEY),
    ]);
  },
};
