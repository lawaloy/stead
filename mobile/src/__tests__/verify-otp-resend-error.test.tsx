import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
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
  devOtpHint: '',
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

describe('verify OTP resend errors', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockVerify.mockResolvedValue({
      token: 'session-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
  });

  it('maps a server resend rate-limit onto the verify screen after the client cooldown', async () => {
    mockRequest.mockRejectedValue(
      new ApiError({
        message: 'Please wait before requesting another OTP.',
        status: 429,
      }),
    );

    await renderScreen();

    expect(
      await screen.findByRole('button', { name: 'Resend code' }),
    ).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    expect(
      await screen.findByRole('alert', {
        name: 'A code was just sent. Wait a moment, then request a new one.',
      }),
    ).toBeOnTheScreen();
    expect(auth.setPendingOtpRequestedAt).not.toHaveBeenCalled();
    expect(auth.setDevOtpHint).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
