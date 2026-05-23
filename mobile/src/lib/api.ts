import * as Axios from 'axios';
import { z } from 'zod';
import { appConfig } from './app-config';
import { resolveApiBaseUrl } from './base-url';
import { ApiError } from './api-error';
import {
  AuthRequestOtpResponseSchema,
  AuthVerifyOtpResponseSchema,
  DashboardStabilityResponseSchema,
  GoalSchema,
  TransactionSchema,
} from '../types/api';

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
  const token = await getTokenFn();
  if (!config.headers) config.headers = new (Axios as any).AxiosHeaders();
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
      | { message?: string | string[]; details?: unknown }
      | string
      | undefined;

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

export const requestOtp = async (
  phone: string,
  countryIso: 'NG' | 'US' | 'GB',
) => {
  const response = await apiClient.post(
    appConfig.api.routes.auth.requestOtp,
    { phone, countryIso },
  );
  return AuthRequestOtpResponseSchema.parse(response.data);
};

export const verifyOtp = async (
  phone: string,
  countryIso: 'NG' | 'US' | 'GB',
  otp: string,
) => {
  const response = await apiClient.post(
    appConfig.api.routes.auth.verifyOtp,
    { phone, countryIso, otp },
  );
  return AuthVerifyOtpResponseSchema.parse(response.data);
};

export const getActiveGoal = async () => {
  const response = await apiClient.get(appConfig.api.routes.goals.active);
  return GoalSchema.parse(response.data);
};

export const createGoal = async (payload: {
  name: string;
  amountTotalKobo: number;
  dueDate: string;
  monthlyIncomeKobo?: number;
}) => {
  const response = await apiClient.post(appConfig.api.routes.goals.create, payload);
  return GoalSchema.parse(response.data);
};

export const createTransaction = async (payload: {
  direction: 'in' | 'out';
  amountKobo: number;
  occurredAt: string;
  note?: string;
  goalId?: string;
}) => {
  const response = await apiClient.post(
    appConfig.api.routes.transactions.create,
    payload,
  );
  return TransactionSchema.parse(response.data);
};

export const getDashboardStability = async () => {
  const response = await apiClient.get(appConfig.api.routes.dashboard.stability);
  return DashboardStabilityResponseSchema.parse(response.data);
};

export const parseApiValidationErrors = (value: unknown) => {
  if (!(value instanceof z.ZodError)) return null;
  return value.issues.map((issue) => issue.message).join(', ');
};
