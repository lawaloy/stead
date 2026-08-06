import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const INSTALLATION_ID_KEY = 'stead.installation-id';
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memoryStore = new Map<string, string>();

let cachedInstallationId: string | null = null;
let pendingInstallationId: Promise<string> | null = null;

const hasSecureStore = () =>
  typeof SecureStore.getItemAsync === 'function' &&
  typeof SecureStore.setItemAsync === 'function' &&
  typeof SecureStore.deleteItemAsync === 'function';

const isValidInstallationId = (value: string | null): value is string =>
  value !== null && DEVICE_ID_PATTERN.test(value);

const getFallbackId = () => {
  try {
    return (
      globalThis.localStorage?.getItem(INSTALLATION_ID_KEY) ??
      memoryStore.get(INSTALLATION_ID_KEY) ??
      null
    );
  } catch {
    return memoryStore.get(INSTALLATION_ID_KEY) ?? null;
  }
};

const setFallbackId = (installationId: string) => {
  try {
    if (globalThis.localStorage) {
      globalThis.localStorage.setItem(INSTALLATION_ID_KEY, installationId);
      return;
    }
  } catch {
    // Fall through to the process-local store when browser storage is blocked.
  }
  memoryStore.set(INSTALLATION_ID_KEY, installationId);
};

const clearFallbackId = () => {
  try {
    globalThis.localStorage?.removeItem(INSTALLATION_ID_KEY);
  } catch {
    // The process-local copy still needs to be cleared.
  }
  memoryStore.delete(INSTALLATION_ID_KEY);
};

const loadStoredId = async () => {
  if (!hasSecureStore()) return getFallbackId();
  try {
    return (
      (await SecureStore.getItemAsync(INSTALLATION_ID_KEY)) ?? getFallbackId()
    );
  } catch {
    return getFallbackId();
  }
};

const persistId = async (installationId: string) => {
  if (!hasSecureStore()) {
    setFallbackId(installationId);
    return;
  }
  try {
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  } catch {
    setFallbackId(installationId);
  }
};

const createInstallationId = () => {
  try {
    return Crypto.randomUUID();
  } catch (error) {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    throw error;
  }
};

const loadOrCreateId = async () => {
  const stored = await loadStoredId();
  if (isValidInstallationId(stored)) {
    cachedInstallationId = stored.toLowerCase();
    return cachedInstallationId;
  }

  const generated = createInstallationId().toLowerCase();
  cachedInstallationId = generated;
  await persistId(generated);
  return generated;
};

export const installationIdStore = {
  async getOrCreateId() {
    if (cachedInstallationId) return cachedInstallationId;
    if (!pendingInstallationId) {
      pendingInstallationId = loadOrCreateId().finally(() => {
        pendingInstallationId = null;
      });
    }
    return pendingInstallationId;
  },

  async clearId() {
    cachedInstallationId = null;
    pendingInstallationId = null;
    if (!hasSecureStore()) {
      clearFallbackId();
      return;
    }
    try {
      await SecureStore.deleteItemAsync(INSTALLATION_ID_KEY);
    } catch {
      // Browser implementations may expose the method but reject when called.
    } finally {
      clearFallbackId();
    }
  },
};
