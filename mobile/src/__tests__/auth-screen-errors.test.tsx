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
import { ApiError } from '../lib/api-error';
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

const renderScreen = (component: React.ReactNode) =>
  render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>,
  );

describe('OTP screen error paths', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockCountries.mockResolvedValue({ countries: fallbackAuthCountries });
    mockRequest.mockResolvedValue({ ok: true, otp: '123456' });
    mockVerify.mockResolvedValue({ token: 'session-token' });
  });

  it('validates an unnormalizable phone before requesting a code', async () => {
    await renderScreen(<RequestOtpScreen />);

    await fireEvent.changeText(screen.getByLabelText('Phone number'), '12');

    expect(
      await screen.findByText(
        'Enter a valid phone number for the selected country',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Request OTP' })).toBeDisabled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('maps a request-OTP rate-limit error onto the login form', async () => {
    mockRequest.mockRejectedValue(
      new ApiError({
        message: 'Too many OTP requests from this network. Try again later.',
        status: 429,
      }),
    );
    await renderScreen(<RequestOtpScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText('0801 234 5678'),
      '08012345678',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Request OTP' }));

    expect(
      await screen.findByText(
        'Too many code requests came from this network. Try again later.',
      ),
    ).toBeOnTheScreen();
    expect(push).not.toHaveBeenCalled();
  });

  it('rejects a non-digit OTP before calling verify', async () => {
    mockAuth.mockReturnValue({
      ...auth,
      devOtpHint: '',
    });
    await renderScreen(<VerifyOtpScreen />);

    await fireEvent.changeText(screen.getByLabelText('One-time code'), '12ab');

    expect(await screen.findByText('OTP must be 6 digits')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('maps an invalid-code verify error onto the OTP form', async () => {
    mockAuth.mockReturnValue({
      ...auth,
      devOtpHint: '',
    });
    mockVerify.mockRejectedValue(
      new ApiError({ message: 'Invalid phone or code', status: 401 }),
    );
    await renderScreen(<VerifyOtpScreen />);

    await fireEvent.changeText(
      screen.getByLabelText('One-time code'),
      '123456',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Verify OTP' }));

    expect(
      await screen.findByText(
        'That code did not match this phone number. Check it and try again.',
      ),
    ).toBeOnTheScreen();
    expect(auth.completeAuth).not.toHaveBeenCalled();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
