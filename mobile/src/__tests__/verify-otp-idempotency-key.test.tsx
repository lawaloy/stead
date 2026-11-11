import React from 'react';
import * as Crypto from 'expo-crypto';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import VerifyOtpScreen from '../../app/(auth)/verify-otp';
import { requestOtp, verifyOtp } from '../lib/api';
import { ApiError } from '../lib/api-error';
import { useAuth } from '../lib/auth-state';
import { queryClient } from '../lib/query-client';

const replace = jest.fn();
const KEY_A = '00000000-0000-4000-8000-0000000000aa';
const KEY_B = '00000000-0000-4000-8000-0000000000bb';
const KEY_C = '00000000-0000-4000-8000-0000000000cc';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});
jest.mock('../lib/auth-state', () => ({ useAuth: jest.fn() }));
jest.mock('../lib/api', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));

const mockRequest = jest.mocked(requestOtp);
const mockVerify = jest.mocked(verifyOtp);
const mockAuth = jest.mocked(useAuth);

const auth = {
  token: null,
  bootstrapping: false,
  pendingPhone: '+2348012345678',
  pendingCountryIso: 'NG' as const,
  pendingOtpRequestedAt: Date.now() - 60_000,
  devOtpHint: '123456',
  sessionEndReason: null as 'expired' | null,
  setPendingPhone: jest.fn(),
  setPendingCountryIso: jest.fn(),
  setPendingOtpRequestedAt: jest.fn(),
  setDevOtpHint: jest.fn(),
  resetPendingAuth: jest.fn(),
  clearSessionEndReason: jest.fn(),
  completeAuth: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <VerifyOtpScreen />
    </QueryClientProvider>,
  );

describe('verify OTP idempotency key lifecycle', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockRequest.mockResolvedValue({ ok: true, otp: '654321' });
    mockVerify.mockRejectedValue(
      new ApiError({ status: 400, message: 'Invalid phone or code' }),
    );
    jest
      .spyOn(Crypto, 'randomUUID')
      .mockReturnValueOnce(KEY_A)
      .mockReturnValueOnce(KEY_B)
      .mockReturnValueOnce(KEY_C);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses one key for the same identity, rotates after the code changes, and mints a new key after resend', async () => {
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));
    expect(mockVerify.mock.calls[0][3]).toBe(KEY_A);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(2));
    expect(mockVerify.mock.calls[1][3]).toBe(KEY_A);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('One-time code'), '111111');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(3));
    expect(mockVerify.mock.calls[2][0]).toBe('+2348012345678');
    expect(mockVerify.mock.calls[2][2]).toBe('111111');
    expect(mockVerify.mock.calls[2][3]).toBe(KEY_B);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));
    });
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(4));
    expect(mockVerify.mock.calls[3][3]).toBe(KEY_C);
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(3);
    expect(replace).not.toHaveBeenCalled();
  });
});
