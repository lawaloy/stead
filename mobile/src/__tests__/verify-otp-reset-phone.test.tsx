import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
  setPendingPhone: jest.fn(),
  setPendingCountryIso: jest.fn(),
  setPendingOtpRequestedAt: jest.fn(),
  setDevOtpHint: jest.fn(),
  resetPendingAuth: jest.fn(),
  completeAuth: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};

describe('verify OTP different-phone reset', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockRequest.mockResolvedValue({ ok: true, otp: '654321' });
    mockVerify.mockResolvedValue({ token: 'session-token' });
  });

  it('clears pending auth before returning to request OTP', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <VerifyOtpScreen />
      </QueryClientProvider>,
    );

    await fireEvent.press(screen.getByText('Use a different phone number'));

    expect(auth.resetPendingAuth).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
