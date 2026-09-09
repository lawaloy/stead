export const appConfig = {
  api: {
    defaultPort: 3000,
    androidEmulatorHost: '10.0.2.2',
    localhost: 'localhost',
    timeoutMs: 15_000,
    routes: {
      auth: {
        countries: '/auth/countries',
        requestOtp: '/auth/request-otp',
        verifyOtp: '/auth/verify-otp',
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
