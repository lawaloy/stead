import axios, {
  AxiosHeaders,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import * as Crypto from 'expo-crypto';
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
import { API_ROUTES, HTTP_HEADERS } from '../contracts/generated/runtime.gen';
import type { AuthSessionTokens } from './token-store';
import { reportError } from './observability';

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

const OTP_REQUEST_MAX_ATTEMPTS = 3;
const OTP_VERIFY_MAX_ATTEMPTS = 3;
const OTP_RETRY_BASE_MS = 500;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryableOtpError = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === undefined ||
    error.status === 408 ||
    error.status === 425 ||
    error.status >= 500);

const otpRetryDelayMs = (failedAttempt: number) => {
  const exponential = OTP_RETRY_BASE_MS * 2 ** (failedAttempt - 1);
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(exponential * jitter);
};

const PUBLIC_AUTH_PATHS = [
  API_ROUTES.getAuthCountries,
  API_ROUTES.requestOtp,
  API_ROUTES.verifyOtp,
  API_ROUTES.refreshSession,
  API_ROUTES.logoutSession,
] as const;

let getTokenFn: AuthConfig['getToken'] = async () => null;
let getRefreshTokenFn: AuthConfig['getRefreshToken'] = async () => null;
let persistSessionFn: AuthConfig['persistSession'] = async () => undefined;
let onUnauthorizedFn: AuthConfig['onUnauthorized'] = () => undefined;
let refreshInFlight: Promise<string | null> | null = null;
let refreshEpoch = 0;
let refreshAllowed = true;

/** Invalidate current and future access-token refreshes so they cannot persist after logout. */
export const abandonInFlightRefresh = () => {
  refreshEpoch += 1;
  refreshAllowed = false;
};

/** Re-enable refresh after a successful login. */
export const allowTokenRefresh = () => {
  refreshAllowed = true;
};

export const waitForInFlightRefresh = () => refreshInFlight;

const isPublicAuthRequest = (config?: InternalAxiosRequestConfig) => {
  const url = config?.url ?? '';
  return PUBLIC_AUTH_PATHS.some(
    (path) => url === path || url.endsWith(path) || url.includes(`${path}?`),
  );
};

const rotateAccessToken = async (): Promise<string | null> => {
  if (!refreshAllowed) return null;
  if (refreshInFlight) return refreshInFlight;

  const epoch = refreshEpoch;
  refreshInFlight = (async () => {
    if (!refreshAllowed || epoch !== refreshEpoch) return null;
    const refreshToken = await getRefreshTokenFn();
    if (!refreshToken) return null;
    if (!refreshAllowed || epoch !== refreshEpoch) return null;

    const payload: RefreshSessionRequest = { refreshToken };
    const response = await apiClient.post(API_ROUTES.refreshSession, payload);
    if (!refreshAllowed || epoch !== refreshEpoch) return null;
    const session = AuthVerifyOtpResponseSchema.parse(response.data);
    if (!refreshAllowed || epoch !== refreshEpoch) return null;
    await persistSessionFn({
      token: session.token,
      refreshToken: session.refreshToken,
    });
    if (!refreshAllowed || epoch !== refreshEpoch) return null;
    return session.token;
  })()
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

const softenUnauthorizedMessage = (message: string) => {
  if (
    message === 'Invalid token' ||
    message === 'Session expired' ||
    message === 'Unauthorized'
  ) {
    return 'Your session expired. Sign in again.';
  }
  return message;
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
  config.headers[HTTP_HEADERS.steadDeviceId] = installationId;
  if (!config.headers.has(HTTP_HEADERS.requestId)) {
    config.headers.set(HTTP_HEADERS.requestId, Crypto.randomUUID());
  }
  return config;
});

const requestIdFrom = (
  config?: InternalAxiosRequestConfig,
  responseHeaders?: unknown,
) => {
  if (responseHeaders && typeof responseHeaders === 'object') {
    const headers = responseHeaders as Record<string, unknown> & {
      get?: (name: string) => unknown;
    };
    const responseId =
      headers.get?.(HTTP_HEADERS.requestId) ??
      headers[HTTP_HEADERS.requestId.toLowerCase()];
    if (typeof responseId === 'string') return responseId;
  }
  const requestId = config?.headers?.get?.(HTTP_HEADERS.requestId);
  return typeof requestId === 'string' ? requestId : undefined;
};

const safeRoute = (config?: InternalAxiosRequestConfig) => {
  const path = (config?.url ?? 'unknown').split('?')[0];
  return path.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    ':id',
  );
};

const reportApiError = (
  error: unknown,
  config?: InternalAxiosRequestConfig,
  statusCode?: number,
  responseHeaders?: unknown,
) => {
  if (statusCode !== undefined && statusCode < 500) return;
  reportError(error, {
    area: 'api',
    operation: (config?.method ?? 'unknown').toUpperCase(),
    requestId: requestIdFrom(config, responseHeaders),
    route: safeRoute(config),
    statusCode,
  });
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error)) {
      if (error instanceof ApiError) {
        reportApiError(error, undefined, error.status);
        throw error;
      }
      const apiError = new ApiError({ message: 'Unexpected network error' });
      reportApiError(apiError);
      throw apiError;
    }

    const status = error.response?.status;
    const original = error.config as RetryableRequestConfig | undefined;
    const body = error.response?.data as
      { message?: string | string[]; details?: unknown } | string | undefined;
    const publicAuth = Boolean(original && isPublicAuthRequest(original));

    if (status === 401 && original && !publicAuth) {
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

    if (status === 401 && !publicAuth) {
      message = softenUnauthorizedMessage(message);
    }

    const requestId = requestIdFrom(original, error.response?.headers);
    const apiError = new ApiError({ message, status, details, requestId });
    reportApiError(apiError, original, status, error.response?.headers);
    throw apiError;
  },
);

export const configureApiAuth = (config: AuthConfig) => {
  getTokenFn = config.getToken;
  getRefreshTokenFn = config.getRefreshToken;
  persistSessionFn = config.persistSession;
  onUnauthorizedFn = config.onUnauthorized;
  refreshAllowed = true;
};

export const fetchAuthCountries = async () => {
  const response = await apiClient.get(API_ROUTES.getAuthCountries);
  return AuthCountriesResponseSchema.parse(response.data);
};

export const requestOtp = async (phone: string, countryIso: string) => {
  const payload: RequestOtpRequest = { phone, countryIso };
  const idempotencyKey = Crypto.randomUUID();

  for (let attempt = 1; attempt <= OTP_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await apiClient.post(API_ROUTES.requestOtp, payload, {
        headers: { [HTTP_HEADERS.idempotencyKey]: idempotencyKey },
      });
      return AuthRequestOtpResponseSchema.parse(response.data);
    } catch (error: unknown) {
      const canRetry =
        isRetryableOtpError(error) && attempt < OTP_REQUEST_MAX_ATTEMPTS;
      if (!canRetry) {
        throw error;
      }
      await wait(otpRetryDelayMs(attempt));
    }
  }

  throw new ApiError({ message: 'OTP request retry policy exhausted' });
};

export const verifyOtp = async (
  phone: string,
  countryIso: string,
  otp: string,
  idempotencyKey = Crypto.randomUUID(),
) => {
  const payload: VerifyOtpRequest = { phone, countryIso, otp };
  for (let attempt = 1; attempt <= OTP_VERIFY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await apiClient.post(API_ROUTES.verifyOtp, payload, {
        headers: { [HTTP_HEADERS.idempotencyKey]: idempotencyKey },
      });
      return AuthVerifyOtpResponseSchema.parse(response.data);
    } catch (error: unknown) {
      const canRetry =
        isRetryableOtpError(error) && attempt < OTP_VERIFY_MAX_ATTEMPTS;
      if (!canRetry) throw error;
      await wait(otpRetryDelayMs(attempt));
    }
  }

  throw new ApiError({ message: 'OTP verification retry policy exhausted' });
};

export const refreshSession = async (refreshToken: string) => {
  const payload: RefreshSessionRequest = { refreshToken };
  const response = await apiClient.post(API_ROUTES.refreshSession, payload);
  return AuthVerifyOtpResponseSchema.parse(response.data);
};

export const logoutSession = async (options?: {
  refreshToken?: string | null;
  allDevices?: boolean;
}) => {
  const payload: LogoutSessionRequest = {};
  if (options?.refreshToken) payload.refreshToken = options.refreshToken;
  if (options?.allDevices) payload.allDevices = true;
  const response = await apiClient.post(API_ROUTES.logoutSession, payload);
  return OkResponseSchema.parse(response.data);
};

export const getActiveGoal = async () => {
  try {
    const response = await apiClient.get(API_ROUTES.getActiveGoal);
    return GoalSchema.parse(response.data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export const createGoal = async (payload: CreateGoalRequest) => {
  const response = await apiClient.post(API_ROUTES.createGoal, payload);
  return GoalSchema.parse(response.data);
};

export const listGoals = async () => {
  const response = await apiClient.get(API_ROUTES.listGoals);
  return z.array(GoalSchema).parse(response.data);
};

export const updateGoal = async (id: string, payload: UpdateGoalRequest) => {
  const response = await apiClient.patch(API_ROUTES.updateGoal(id), payload);
  return GoalSchema.parse(response.data);
};

export const endGoal = async (id: string, payload: EndGoalRequest) => {
  const response = await apiClient.post(API_ROUTES.endGoal(id), payload);
  return GoalSchema.parse(response.data);
};

export const createTransaction = async (payload: CreateTransactionRequest) => {
  const response = await apiClient.post(API_ROUTES.createTransaction, payload);
  return TransactionSchema.parse(response.data);
};

export const listTransactions = async (query?: {
  from?: string;
  to?: string;
}) => {
  const response = await apiClient.get(API_ROUTES.listTransactions, {
    params: query,
  });
  return z.array(TransactionSchema).parse(response.data);
};

export const updateTransaction = async (
  id: string,
  payload: UpdateTransactionRequest,
) => {
  const response = await apiClient.patch(
    API_ROUTES.updateTransaction(id),
    payload,
  );
  return TransactionSchema.parse(response.data);
};

export const deleteTransaction = async (id: string) => {
  const response = await apiClient.delete(API_ROUTES.deleteTransaction(id));
  return OkResponseSchema.parse(response.data);
};

export const previewTransactionImport = async (
  payload: PreviewTransactionImportRequest,
) => {
  const response = await apiClient.post(
    API_ROUTES.previewTransactionImport,
    payload,
  );
  return TransactionImportPreviewSchema.parse(response.data);
};

export const confirmTransactionImport = async (
  payload: ConfirmTransactionImportRequest,
) => {
  const response = await apiClient.post(
    API_ROUTES.confirmTransactionImport,
    payload,
  );
  return TransactionImportResultSchema.parse(response.data);
};

export const getDashboardStability = async () => {
  const response = await apiClient.get(API_ROUTES.getDashboardStability);
  return DashboardStabilityResponseSchema.parse(response.data);
};

export const getAlertPreferences = async () => {
  const response = await apiClient.get(API_ROUTES.getAlertPreferences);
  return AlertPreferencesSchema.parse(response.data);
};

export const updateAlertPreferences = async (
  payload: UpdateAlertPreferencesRequest,
) => {
  const response = await apiClient.patch(
    API_ROUTES.updateAlertPreferences,
    payload,
  );
  return AlertPreferencesSchema.parse(response.data);
};

export const getAccount = async () => {
  const response = await apiClient.get(API_ROUTES.getAccount);
  return AccountResponseSchema.parse(response.data);
};

export const updateAccountProfile = async (
  payload: UpdateAccountProfileRequest,
) => {
  const response = await apiClient.patch(
    API_ROUTES.updateAccountProfile,
    payload,
  );
  return AccountResponseSchema.parse(response.data);
};

export const updateAccountConsents = async (
  payload: UpdateAccountConsentsRequest,
) => {
  const response = await apiClient.put(
    API_ROUTES.updateAccountConsents,
    payload,
  );
  return AccountResponseSchema.parse(response.data);
};

export const exportAccountData = async () => {
  const response = await apiClient.get(API_ROUTES.exportAccountData);
  return AccountDataExportSchema.parse(response.data);
};

export const deleteAccount = async () => {
  const response = await apiClient.delete(API_ROUTES.deleteAccount, {
    data: { confirmation: 'DELETE' },
  });
  return DeleteAccountResponseSchema.parse(response.data);
};

export const parseApiValidationErrors = (value: unknown) => {
  if (!(value instanceof z.ZodError)) return null;
  return value.issues.map((issue) => issue.message).join(', ');
};
