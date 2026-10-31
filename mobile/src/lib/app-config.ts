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
    routes: {
      auth: {
        countries: '/auth/countries',
        requestOtp: '/auth/request-otp',
        verifyOtp: '/auth/verify-otp',
        refresh: '/auth/refresh',
        logout: '/auth/logout',
      },
      goals: {
        active: '/goals/active',
        create: '/goals',
        list: '/goals',
        detail: (id: string) => `/goals/${id}`,
        end: (id: string) => `/goals/${id}/end`,
      },
      transactions: {
        create: '/transactions',
        list: '/transactions',
        importPreview: '/transactions/import/preview',
        importConfirm: '/transactions/import',
        detail: (id: string) => `/transactions/${id}`,
      },
      dashboard: {
        stability: '/dashboard/stability',
      },
      notifications: {
        inspection: '/notifications/inspection',
      },
      alerts: {
        preferences: '/alerts/preferences',
      },
      account: {
        root: '/account',
        profile: '/account/profile',
        consents: '/account/consents',
        export: '/account/export',
      },
    },
  },
  support: {
    email: process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  },
} as const;
