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
    },
  },
} as const;
