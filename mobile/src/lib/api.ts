import axios, { AxiosHeaders, isAxiosError } from 'axios';
import { z } from 'zod';
import { resolveApiBaseUrl } from './base-url';
import {
  AuthRequestOtpResponseSchema,
  AuthVerifyOtpResponseSchema,
  DashboardStabilityResponseSchema,
  GoalSchema,
  TransactionSchema,
} from '../types/api';

type AuthConfig = {
  getToken: () => Promise<string | null>;
  onUnauthorized: () => Promise<void> | void;
};

type ApiErrorShape = {
  message: string;
  status?: number;
  details?: unknown;
};

export class ApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(input: ApiErrorShape) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.details = input.details;
  }
}

let getTokenFn: AuthConfig['getToken'] = async () => null;
let onUnauthorizedFn: AuthConfig['onUnauthorized'] = () => undefined;

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15_000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getTokenFn();
  if (!config.headers) config.headers = new AxiosHeaders();
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
      | { message?: string; details?: unknown }
      | string
      | undefined;

    if (status === 401) await onUnauthorizedFn();

    let message = error.message || 'Request failed';
    let details: unknown = undefined;
    if (typeof body === 'string') message = body;
    if (body && typeof body === 'object') {
      message =
        (body as { message?: string }).message ||
        (Array.isArray((body as { message?: unknown }).message)
          ? ((body as { message?: string[] }).message || []).join(', ')
          : message);
      details = (body as { details?: unknown }).details;
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
  const response = await apiClient.post('/auth/request-otp', { phone, countryIso });
  return AuthRequestOtpResponseSchema.parse(response.data);
};

export const verifyOtp = async (
  phone: string,
  countryIso: 'NG' | 'US' | 'GB',
  otp: string,
) => {
  const response = await apiClient.post('/auth/verify-otp', { phone, countryIso, otp });
  return AuthVerifyOtpResponseSchema.parse(response.data);
};

export const getActiveGoal = async () => {
  const response = await apiClient.get('/goals/active');
  return GoalSchema.parse(response.data);
};

export const createGoal = async (payload: {
  name: string;
  amountTotalKobo: number;
  dueDate: string;
  monthlyIncomeKobo?: number;
}) => {
  const response = await apiClient.post('/goals', payload);
  return GoalSchema.parse(response.data);
};

export const createTransaction = async (payload: {
  direction: 'in' | 'out';
  amountKobo: number;
  occurredAt: string;
  note?: string;
  goalId?: string;
}) => {
  const response = await apiClient.post('/transactions', payload);
  return TransactionSchema.parse(response.data);
};

export const getDashboardStability = async () => {
  const response = await apiClient.get('/dashboard/stability');
  return DashboardStabilityResponseSchema.parse(response.data);
};

export const parseApiValidationErrors = (value: unknown) => {
  if (!(value instanceof z.ZodError)) return null;
  return value.issues.map((issue) => issue.message).join(', ');
};
