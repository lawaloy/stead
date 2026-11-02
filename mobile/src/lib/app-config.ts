const DEFAULT_API_TIMEOUT_MS = 15_000;

export const resolveApiTimeoutMs = (
  value = process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
) => {
  if (!/^\d+$/.test(value?.trim() ?? '')) return DEFAULT_API_TIMEOUT_MS;
  const milliseconds = Number(value);
  return Number.isSafeInteger(milliseconds) &&
    milliseconds >= 1_000 &&
    milliseconds <= 120_000
    ? milliseconds
    : DEFAULT_API_TIMEOUT_MS;
};

export const appConfig = {
  api: {
    defaultPort: 3000,
    androidEmulatorHost: '10.0.2.2',
    localhost: 'localhost',
    timeoutMs: resolveApiTimeoutMs(),
  },
  support: {
    email: process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  },
} as const;
