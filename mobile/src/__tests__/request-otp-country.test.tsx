import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import RequestOtpScreen from '../../app/(auth)/request-otp';
import { fetchAuthCountries, requestOtp } from '../lib/api';
import { useAuth } from '../lib/auth-state';
import { fallbackAuthCountries } from '../lib/countries';
import { queryClient } from '../lib/query-client';

const push = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
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
}));

const mockCountries = jest.mocked(fetchAuthCountries);
const mockRequest = jest.mocked(requestOtp);
const mockAuth = jest.mocked(useAuth);

const auth = {
  token: null,
  bootstrapping: false,
  pendingPhone: '',
  pendingCountryIso: 'NG' as const,
  pendingOtpRequestedAt: null,
  devOtpHint: '',
  setPendingPhone: jest.fn(),
  setPendingCountryIso: jest.fn(),
  setPendingOtpRequestedAt: jest.fn(),
  setDevOtpHint: jest.fn(),
  resetPendingAuth: jest.fn(),
  completeAuth: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <RequestOtpScreen />
    </QueryClientProvider>,
  );

describe('request OTP country selection', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockCountries.mockResolvedValue({ countries: fallbackAuthCountries });
    mockRequest.mockResolvedValue({ ok: true, otp: '123456' });
  });

  it('normalizes the submitted number to the selected country', async () => {
    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Choose country' }),
      ).toBeEnabled(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Choose country' }),
    );
    await fireEvent.press(screen.getByText('United States +1'));
    await fireEvent.changeText(
      screen.getByLabelText('Phone number'),
      '4155552671',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Request OTP' }));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('+14155552671', 'US'),
    );
    expect(auth.setPendingPhone).toHaveBeenCalledWith('+14155552671');
    expect(auth.setPendingCountryIso).toHaveBeenCalledWith('US');
    expect(push).toHaveBeenCalledWith('/(auth)/verify-otp');
  });

  it('keeps login working from the fallback country list when countries fail to load', async () => {
    mockCountries.mockRejectedValue(new Error('offline'));

    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Choose country' }),
      ).toBeOnTheScreen(),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Phone number'),
      '08012345678',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Request OTP' }));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('+2348012345678', 'NG'),
    );
    expect(push).toHaveBeenCalledWith('/(auth)/verify-otp');
  });
});
