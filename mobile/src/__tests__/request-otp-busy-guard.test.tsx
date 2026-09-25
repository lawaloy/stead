import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
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

describe('request OTP busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockAuth.mockReturnValue(auth);
    mockCountries.mockResolvedValue({ countries: fallbackAuthCountries });
  });

  it('locks the form and blocks a second request while OTP request is in flight', async () => {
    let resolveRequest:
      ((value: { ok: true; otp: string }) => void) | undefined;
    mockRequest.mockImplementation(
      () =>
        new Promise<{ ok: true; otp: string }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    await renderScreen();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Choose country' }),
      ).toBeEnabled(),
    );

    await fireEvent.changeText(
      screen.getByPlaceholderText('0801 234 5678'),
      '08012345678',
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Request OTP' }));
    });

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith('+2348012345678', 'NG'),
    );
    expect(await screen.findByText('Requesting...')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Requesting...' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Choose country' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Phone number').props.editable).toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest?.({ ok: true, otp: '123456' });
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(auth.setPendingPhone).toHaveBeenCalledWith('+2348012345678');
    expect(push).toHaveBeenCalledWith('/(auth)/verify-otp');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
