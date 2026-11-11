import React from 'react';
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
  devOtpHint: '123456',
  sessionEndReason: null as 'expired' | null,
  setPendingPhone: jest.fn(),
  setPendingCountryIso: jest.fn(),
  setPendingOtpRequestedAt: jest.fn(),
  setDevOtpHint: jest.fn(),
  resetPendingAuth: jest.fn(),
  clearSessionEndReason: jest.fn(),
  completeAuth: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <VerifyOtpScreen />
    </QueryClientProvider>,
  );

describe('verify OTP completeAuth failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockRequest.mockResolvedValue({ ok: true, otp: '654321' });
    mockVerify.mockResolvedValue({
      token: 'session-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
    auth.completeAuth.mockRejectedValue(new Error('secure-store-write-failed'));
  });

  it('keeps the user on verify and does not navigate when session persist fails', async () => {
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });

    await waitFor(() =>
      expect(auth.completeAuth).toHaveBeenCalledWith({
        token: 'session-token',
        refreshToken: 'refresh-token',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('alert', {
          name: 'We could not verify that code right now. Try again in a moment.',
        }),
      ).toBeOnTheScreen(),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(auth.setDevOtpHint).not.toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});
