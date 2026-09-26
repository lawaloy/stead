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
  completeAuth: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <VerifyOtpScreen />
    </QueryClientProvider>,
  );

describe('verify OTP busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockRequest.mockResolvedValue({ ok: true, otp: '654321' });
  });

  it('blocks resend while verify is in flight', async () => {
    let resolveVerify: ((value: { token: string }) => void) | undefined;
    mockVerify.mockImplementation(
      () =>
        new Promise<{ token: string }>((resolve) => {
          resolveVerify = resolve;
        }),
    );

    await renderScreen();

    expect(
      await screen.findByRole('button', { name: 'Resend code' }),
    ).toBeEnabled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));
    });

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith('+2348012345678', 'NG', '123456'),
    );
    expect(await screen.findByText('Verifying...')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeDisabled();
    expect(mockRequest).not.toHaveBeenCalled();

    await act(async () => {
      resolveVerify?.({ token: 'session-token' });
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(auth.completeAuth).toHaveBeenCalledWith('session-token');
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
