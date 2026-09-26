import axios, {
  AxiosHeaders,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { z } from 'zod';
import { appConfig } from './app-config';
import { resolveApiBaseUrl } from './base-url';
import { ApiError } from './api-error';
import { installationIdStore } from './installation-id-store';
import {
  AuthCountriesResponseSchema,
  AuthRequestOtpResponseSchema,
  AuthVerifyOtpResponseSchema,
  AlertPreferencesSchema,
  AccountDataExportSchema,
  AccountResponseSchema,
  DeleteAccountResponseSchema,
  DashboardStabilityResponseSchema,
  GoalSchema,
  OkResponseSchema,
  TransactionSchema,
  TransactionImportPreviewSchema,
  TransactionImportResultSchema,
} from '../types/api';
import type {
  CreateGoalRequest,
  CreateTransactionRequest,
  EndGoalRequest,
  LogoutSessionRequest,
  RefreshSessionRequest,
  RequestOtpRequest,
  UpdateTransactionRequest,
  UpdateGoalRequest,
  VerifyOtpRequest,
  UpdateAlertPreferencesRequest,
  UpdateAccountConsentsRequest,
  UpdateAccountProfileRequest,
  ConfirmTransactionImportRequest,
  PreviewTransactionImportRequest,
} from '../contracts/generated/types.gen';
import type { AuthSessionTokens } from './token-store';

export { ApiError } from './api-error';

type UnauthorizedOptions = {
  reason?: 'expired';
};

type AuthConfig = {
  getToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  persistSession: (session: AuthSessionTokens) => Promise<void>;
  onUnauthorized: (options?: UnauthorizedOptions) => Promise<void> | void;
};

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _steadRetry?: boolean;
};

const PUBLIC_AUTH_PATHS = [
  appConfig.api.routes.auth.countries,
  appConfig.api.routes.auth.requestOtp,
  appConfig.api.routes.auth.verifyOtp,
  appConfig.api.routes.auth.refresh,
  appConfig.api.routes.auth.logout,
] as const;

let getTokenFn: AuthConfig['getToken'] = async () => null;
let getRefreshTokenFn: AuthConfig['getRefreshToken'] = async () => null;
let persistSessionFn: AuthConfig['persistSession'] = async () => undefined;
let onUnauthorizedFn: AuthConfig['onUnauthorized'] = () => undefined;
let refreshInFlight: Promise<string | null> | null = null;

const isPublicAuthRequest = (config?: InternalAxiosRequestConfig) => {
  const url = config?.url ?? '';
  return PUBLIC_AUTH_PATHS.some(
    (path) => url === path || url.endsWith(path) || url.includes(`${path}?`),
  );
};

const rotateAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshTokenFn();
    if (!refreshToken) return null;

    const payload: RefreshSessionRequest = { refreshToken };
    const response = await apiClient.post(
      appConfig.api.routes.auth.refresh,
      payload,
    );
    const session = AuthVerifyOtpResponseSchema.parse(response.data);
    await persistSessionFn({
      token: session.token,
      refreshToken: session.refreshToken,
    });
    return session.token;
  })()
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: appConfig.api.timeoutMs,
});

apiClient.interceptors.request.use(async (config) => {
  const [token, installationId] = await Promise.all([
    getTokenFn(),
    installationIdStore.getOrCreateId(),
  ]);
  if (!config.headers) config.headers = new AxiosHeaders();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Stead-Device-Id'] = installationId;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error)) {
      if (error instanceof ApiError) throw error;
      throw new ApiError({ message: 'Unexpected network error' });
    }

    const status = error.response?.status;
    const original = error.config as RetryableRequestConfig | undefined;
    const body = error.response?.data as
      { message?: string | string[]; details?: unknown } | string | undefined;

    if (status === 401 && original && !isPublicAuthRequest(original)) {
      if (!original._steadRetry) {
        const nextToken = await rotateAccessToken();
        if (nextToken) {
          original._steadRetry = true;
          if (!original.headers) original.headers = new AxiosHeaders();
          original.headers.Authorization = `Bearer ${nextToken}`;
          // axios-mock-adapter (and some adapters) stick on the failed config;
          // drop it so the retried request goes through the client again.
          delete original.adapter;
          return apiClient.request(original);
        }
      }
      await onUnauthorizedFn({ reason: 'expired' });
    }

    let message = error.message || 'Request failed';
    let details: unknown = undefined;
    if (typeof body === 'string') message = body;
    if (body && typeof body === 'object') {
      if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      } else if (body.message) {
        message = body.message;
      }
      details = body.details;
    }

    throw new ApiError({ message, status, details });
  },
);

export const configureApiAuth = (config: AuthConfig) => {
  getTokenFn = config.getToken;
  getRefreshTokenFn = config.getRefreshToken;
  persistSessionFn = config.persistSession;
  onUnauthorizedFn = config.onUnauthorized;
};

export const fetchAuthCountries = async () => {
  const response = await apiClient.get(appConfig.api.routes.auth.countries);
  return AuthCountriesResponseSchema.parse(response.data);
};

export const requestOtp = async (phone: string, countryIso: string) => {
  const payload: RequestOtpRequest = { phone, countryIso };
  const response = await apiClient.post(
    appConfig.api.routes.auth.requestOtp,
    payload,
  );
  return AuthRequestOtpResponseSchema.parse(response.data);
};

export const verifyOtp = async (
  phone: string,
  countryIso: string,
  otp: string,
) => {
  const payload: VerifyOtpRequest = { phone, countryIso, otp };
  const response = await apiClient.post(
    appConfig.api.routes.auth.verifyOtp,
    payload,
  );
  return AuthVerifyOtpResponseSchema.parse(response.data);
};

export const refreshSession = async (refreshToken: string) => {
  const payload: RefreshSessionRequest = { refreshToken };
  const response = await apiClient.post(
    appConfig.api.routes.auth.refresh,
    payload,
  );
  return AuthVerifyOtpResponseSchema.parse(response.data);
};

export const logoutSession = async (refreshToken?: string | null) => {
  const payload: LogoutSessionRequest = {};
  if (refreshToken) payload.refreshToken = refreshToken;
  const response = await apiClient.post(
    appConfig.api.routes.auth.logout,
    payload,
  );
  return OkResponseSchema.parse(response.data);
};

export const getActiveGoal = async () => {
  try {
    const response = await apiClient.get(appConfig.api.routes.goals.active);
    return GoalSchema.parse(response.data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const createGoal = async (payload: CreateGoalRequest) => {
  const response = await apiClient.post(
    appConfig.api.routes.goals.create,
    payload,
  );
  return GoalSchema.parse(response.data);
};

export const listGoals = async () => {
  const response = await apiClient.get(appConfig.api.routes.goals.list);
  return z.array(GoalSchema).parse(response.data);
};

export const updateGoal = async (id: string, payload: UpdateGoalRequest) => {
  const response = await apiClient.patch(
    appConfig.api.routes.goals.detail(id),
    payload,
  );
  return GoalSchema.parse(response.data);
};

export const endGoal = async (id: string, payload: EndGoalRequest) => {
  const response = await apiClient.post(
    appConfig.api.routes.goals.end(id),
    payload,
  );
  return GoalSchema.parse(response.data);
};

export const createTransaction = async (payload: CreateTransactionRequest) => {
  const response = await apiClient.post(
    appConfig.api.routes.transactions.create,
    payload,
  );
  return TransactionSchema.parse(response.data);
};

export const listTransactions = async (query?: {
  from?: string;
  to?: string;
}) => {
  const response = await apiClient.get(appConfig.api.routes.transactions.list, {
    params: query,
  });
  return z.array(TransactionSchema).parse(response.data);
};

export const updateTransaction = async (
  id: string,
  payload: UpdateTransactionRequest,
) => {
  const response = await apiClient.patch(
    appConfig.api.routes.transactions.detail(id),
    payload,
  );
  return TransactionSchema.parse(response.data);
};

export const deleteTransaction = async (id: string) => {
  const response = await apiClient.delete(
    appConfig.api.routes.transactions.detail(id),
  );
  return OkResponseSchema.parse(response.data);
};

export const previewTransactionImport = async (
  payload: PreviewTransactionImportRequest,
) => {
  const response = await apiClient.post(
    appConfig.api.routes.transactions.importPreview,
    payload,
  );
  return TransactionImportPreviewSchema.parse(response.data);
};

export const confirmTransactionImport = async (
  payload: ConfirmTransactionImportRequest,
) => {
  const response = await apiClient.post(
    appConfig.api.routes.transactions.importConfirm,
    payload,
  );
  return TransactionImportResultSchema.parse(response.data);
};

export const getDashboardStability = async () => {
  const response = await apiClient.get(
    appConfig.api.routes.dashboard.stability,
  );
  return DashboardStabilityResponseSchema.parse(response.data);
};

export const getAlertPreferences = async () => {
  const response = await apiClient.get(appConfig.api.routes.alerts.preferences);
  return AlertPreferencesSchema.parse(response.data);
};

export const updateAlertPreferences = async (
  payload: UpdateAlertPreferencesRequest,
) => {
  const response = await apiClient.patch(
    appConfig.api.routes.alerts.preferences,
    payload,
  );
  return AlertPreferencesSchema.parse(response.data);
};

export const getAccount = async () => {
  const response = await apiClient.get(appConfig.api.routes.account.root);
  return AccountResponseSchema.parse(response.data);
};

export const updateAccountProfile = async (
  payload: UpdateAccountProfileRequest,
) => {
  const response = await apiClient.patch(
    appConfig.api.routes.account.profile,
    payload,
  );
  return AccountResponseSchema.parse(response.data);
};

export const updateAccountConsents = async (
  payload: UpdateAccountConsentsRequest,
) => {
  const response = await apiClient.put(
    appConfig.api.routes.account.consents,
    payload,
  );
  return AccountResponseSchema.parse(response.data);
};

export const exportAccountData = async () => {
  const response = await apiClient.get(appConfig.api.routes.account.export);
  return AccountDataExportSchema.parse(response.data);
};

export const deleteAccount = async () => {
  const response = await apiClient.delete(appConfig.api.routes.account.root, {
    data: { confirmation: 'DELETE' },
  });
  return DeleteAccountResponseSchema.parse(response.data);
};

export const parseApiValidationErrors = (value: unknown) => {
  if (!(value instanceof z.ZodError)) return null;
  return value.issues.map((issue) => issue.message).join(', ');
};
