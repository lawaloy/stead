// This file is generated from contracts/openapi.yaml. Do not edit it directly.

export const HTTP_HEADERS = {
  requestId: 'X-Request-ID',
  idempotencyKey: 'Idempotency-Key',
  steadDeviceId: 'X-Stead-Device-Id',
} as const;

export const API_ROUTES = {
  getAuthCountries: '/auth/countries',
  requestOtp: '/auth/request-otp',
  verifyOtp: '/auth/verify-otp',
  refreshSession: '/auth/refresh',
  logoutSession: '/auth/logout',
  listGoals: '/goals',
  createGoal: '/goals',
  getActiveGoal: '/goals/active',
  updateGoal: (id: string) => `/goals/${encodeURIComponent(id)}`,
  endGoal: (id: string) => `/goals/${encodeURIComponent(id)}/end`,
  listTransactions: '/transactions',
  createTransaction: '/transactions',
  previewTransactionImport: '/transactions/import/preview',
  confirmTransactionImport: '/transactions/import',
  updateTransaction: (id: string) => `/transactions/${encodeURIComponent(id)}`,
  deleteTransaction: (id: string) => `/transactions/${encodeURIComponent(id)}`,
  getDashboardStability: '/dashboard/stability',
  getAlertPreferences: '/alerts/preferences',
  updateAlertPreferences: '/alerts/preferences',
  getAccount: '/account',
  deleteAccount: '/account',
  updateAccountProfile: '/account/profile',
  updateAccountConsents: '/account/consents',
  exportAccountData: '/account/export',
} as const;
