import * as Axios from 'axios';
import { z } from 'zod';
import { appConfig } from './app-config';
import { resolveApiBaseUrl } from './base-url';
import { ApiError } from './api-error';
import { installationIdStore } from './installation-id-store';
import {
  AuthCountriesResponseSchema,
  AuthRequestOtpResponseSchema,
  AuthVerifyOtpResponseSchema,
  DashboardStabilityResponseSchema,
  GoalSchema,
  OkResponseSchema,
  TransactionSchema,
} from '../types/api';
import type {
  CreateGoalRequest,
  CreateTransactionRequest,
  RequestOtpRequest,
  UpdateTransactionRequest,
  VerifyOtpRequest,
} from '../contracts/generated/types.gen';

export { ApiError } from './api-error';

const axios = Axios as unknown as typeof import('axios');
const isAxiosError = Axios.isAxiosError;

type AuthConfig = {
  getToken: () => Promise<string | null>;
  onUnauthorized: () => Promise<void> | void;
};

let getTokenFn: AuthConfig['getToken'] = async () => null;
let onUnauthorizedFn: AuthConfig['onUnauthorized'] = () => undefined;

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: appConfig.api.timeoutMs,
});

apiClient.interceptors.request.use(async (config) => {
  const [token, installationId] = await Promise.all([
    getTokenFn(),
    installationIdStore.getOrCreateId(),
  ]);
  if (!config.headers) config.headers = new (Axios as any).AxiosHeaders();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Stead-Device-Id'] = installationId;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error)) {
      throw new ApiError({ message: 'Unexpected network error' });
    }

    const status = error.response?.status;
    const body = error.response?.data as
      { message?: string | string[]; details?: unknown } | string | undefined;

    if (status === 401) await onUnauthorizedFn();

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

export const getActiveGoal = async () => {
  const response = await apiClient.get(appConfig.api.routes.goals.active);
  return GoalSchema.parse(response.data);
};

export const createGoal = async (payload: CreateGoalRequest) => {
  const response = await apiClient.post(
    appConfig.api.routes.goals.create,
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

export const getDashboardStability = async () => {
  const response = await apiClient.get(
    appConfig.api.routes.dashboard.stability,
  );
  return DashboardStabilityResponseSchema.parse(response.data);
};

export const parseApiValidationErrors = (value: unknown) => {
  if (!(value instanceof z.ZodError)) return null;
  return value.issues.map((issue) => issue.message).join(', ');
};
