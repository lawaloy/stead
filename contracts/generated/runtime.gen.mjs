// This file is generated from contracts/openapi.yaml. Do not edit it directly.

export const HTTP_HEADERS = Object.freeze({
  requestId: 'X-Request-ID',
  idempotencyKey: 'Idempotency-Key',
  steadDeviceId: 'X-Stead-Device-Id',
});

export const API_ROUTES = Object.freeze({
  getAuthCountries: '/auth/countries',
  requestOtp: '/auth/request-otp',
  verifyOtp: '/auth/verify-otp',
  refreshSession: '/auth/refresh',
  logoutSession: '/auth/logout',
  listGoals: '/goals',
  createGoal: '/goals',
  getActiveGoal: '/goals/active',
  updateGoal: (id) => `/goals/${encodeURIComponent(id)}`,
  endGoal: (id) => `/goals/${encodeURIComponent(id)}/end`,
  listTransactions: '/transactions',
  createTransaction: '/transactions',
  previewTransactionImport: '/transactions/import/preview',
  confirmTransactionImport: '/transactions/import',
  updateTransaction: (id) => `/transactions/${encodeURIComponent(id)}`,
  deleteTransaction: (id) => `/transactions/${encodeURIComponent(id)}`,
  getDashboardStability: '/dashboard/stability',
  getAlertPreferences: '/alerts/preferences',
  updateAlertPreferences: '/alerts/preferences',
  getAccount: '/account',
  deleteAccount: '/account',
  updateAccountProfile: '/account/profile',
  updateAccountConsents: '/account/consents',
  exportAccountData: '/account/export',
});
