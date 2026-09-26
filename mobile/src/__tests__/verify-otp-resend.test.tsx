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
  pendingOtpRequestedAt: Date.now(),
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

describe('verify OTP resend cooldown', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ ok: true, otp: '654321' });
    mockVerify.mockResolvedValue({ token: 'session-token' });
  });

  it('keeps resend disabled while the cooldown is still running', async () => {
    mockAuth.mockReturnValue({
      ...auth,
      pendingOtpRequestedAt: Date.now(),
    });

    await renderScreen();

    expect(await screen.findByText(/Resend in \d+s/)).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Wait for the countdown before asking for another code.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Resend in \d+s/ }),
    ).toBeDisabled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sends a fresh code once the cooldown has elapsed', async () => {
    mockAuth.mockReturnValue({
      ...auth,
      pendingOtpRequestedAt: Date.now() - 60_000,
    });

    await renderScreen();

    expect(
      await screen.findByRole('button', { name: 'Resend code' }),
    ).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('+2348012345678', 'NG'),
    );
    expect(auth.setPendingOtpRequestedAt).toHaveBeenCalled();
    expect(auth.setDevOtpHint).toHaveBeenCalledWith('654321');
    expect(
      await screen.findByText('A fresh code is on the way.'),
    ).toBeOnTheScreen();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
