import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import RequestOtpScreen from '../../app/(auth)/request-otp';
import VerifyOtpScreen from '../../app/(auth)/verify-otp';
import { fetchAuthCountries, requestOtp, verifyOtp } from '../lib/api';
import { useAuth } from '../lib/auth-state';
import { fallbackAuthCountries } from '../lib/countries';
import { queryClient } from '../lib/query-client';

const push = jest.fn();
const replace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push, replace }),
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
  fetchAuthCountries: jest.fn(),
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));

const mockCountries = jest.mocked(fetchAuthCountries);
const mockRequest = jest.mocked(requestOtp);
const mockVerify = jest.mocked(verifyOtp);
const mockAuth = jest.mocked(useAuth);

const auth = {
  token: null,
  bootstrapping: false,
  pendingPhone: '+2348012345678',
  pendingCountryIso: 'NG' as const,
  pendingOtpRequestedAt: null,
  devOtpHint: '123456',
  setPendingPhone: jest.fn(),
  setPendingCountryIso: jest.fn(),
  setPendingOtpRequestedAt: jest.fn(),
  setDevOtpHint: jest.fn(),
  resetPendingAuth: jest.fn(),
  completeAuth: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};

const renderScreen = (component: React.ReactNode) =>
  render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>,
  );

describe('OTP screen journeys', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockCountries.mockResolvedValue({ countries: fallbackAuthCountries });
    mockRequest.mockResolvedValue({ ok: true, otp: '123456' });
    mockVerify.mockResolvedValue({ token: 'session-token' });
  });

  it('validates the phone, requests a code, and carries the submitted identity to verification', async () => {
    await renderScreen(<RequestOtpScreen />);
    expect(screen.getByRole('button', { name: 'Request OTP' })).toBeDisabled();

    await fireEvent.changeText(
      screen.getByPlaceholderText('0801 234 5678'),
      '08012345678',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Request OTP' }));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('+2348012345678', 'NG'),
    );
    expect(auth.setPendingPhone).toHaveBeenCalledWith('+2348012345678');
    expect(auth.setPendingCountryIso).toHaveBeenCalledWith('NG');
    expect(auth.setDevOtpHint).toHaveBeenCalledWith('123456');
    expect(push).toHaveBeenCalledWith('/(auth)/verify-otp');
  });

  it('verifies the code and persists the session before entering the dashboard', async () => {
    await renderScreen(<VerifyOtpScreen />);
    expect(screen.getByText('Dev OTP: 123456')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith('+2348012345678', 'NG', '123456'),
    );
    await waitFor(() =>
      expect(auth.completeAuth).toHaveBeenCalledWith('session-token'),
    );
    expect(replace).toHaveBeenCalledWith('/(app)/dashboard');
  });

  it('does not verify when there is no pending phone', async () => {
    mockAuth.mockReturnValue({ ...auth, pendingPhone: '' });
    await renderScreen(<VerifyOtpScreen />);

    expect(
      screen.getByText('No phone found. Start from Request OTP.'),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Go to Request OTP' }),
    );
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
