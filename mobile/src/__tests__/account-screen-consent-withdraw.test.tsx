import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AccountScreen from '../../app/(app)/account';
import {
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../lib/api';
import { queryClient } from '../lib/query-client';

const replace = jest.fn();
const logout = jest.fn();

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
jest.mock('../lib/auth-state', () => ({
  useAuth: () => ({ token: 'session-token', logout }),
}));
jest.mock('../lib/api', () => ({
  deleteAccount: jest.fn(),
  exportAccountData: jest.fn(),
  getAccount: jest.fn(),
  updateAccountConsents: jest.fn(),
  updateAccountProfile: jest.fn(),
}));

const grantedAccount = {
  profile: {
    id: 'user_1',
    phone: '+2348012345678',
    displayName: 'Ada',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  consents: {
    analyticsEnabled: true,
    productResearchEnabled: true,
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
};

const withdrawnAccount = {
  ...grantedAccount,
  consents: {
    analyticsEnabled: false,
    productResearchEnabled: false,
    updatedAt: '2026-09-08T12:00:00.000Z',
  },
};

const mockConsents = jest.mocked(updateAccountConsents);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen consent withdrawal', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(grantedAccount);
    jest.mocked(updateAccountProfile).mockResolvedValue(grantedAccount);
    jest.mocked(exportAccountData).mockResolvedValue({
      schemaVersion: 1,
      exportedAt: '2026-09-08T12:00:00.000Z',
      profile: grantedAccount.profile,
      consents: grantedAccount.consents,
      consentHistory: [],
      goals: [],
      transactions: [],
      alertPreferences: null,
      authHistory: [],
      notificationHistory: [],
    });
    jest.mocked(deleteAccount).mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:01:00.000Z',
    });
    mockConsents.mockResolvedValue(withdrawnAccount);
  });

  it('persists turning off previously granted analytics and research consents', async () => {
    await renderScreen();
    await screen.findByText('+2348012345678');

    const analytics = screen.getByRole('switch', { name: 'Product analytics' });
    const research = screen.getByRole('switch', { name: 'Product research' });
    expect(analytics).toBeChecked();
    expect(research).toBeChecked();

    await fireEvent.press(analytics);
    await fireEvent.press(research);
    expect(analytics).not.toBeChecked();
    expect(research).not.toBeChecked();

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Save consent choices' }),
      );
    });

    await waitFor(() =>
      expect(mockConsents).toHaveBeenCalledWith({
        analyticsEnabled: false,
        productResearchEnabled: false,
      }),
    );
    expect(mockConsents).not.toHaveBeenCalledWith(
      expect.objectContaining({ analyticsEnabled: true }),
    );
    expect(mockConsents).not.toHaveBeenCalledWith(
      expect.objectContaining({ productResearchEnabled: true }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Consent choices saved' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('switch', { name: 'Product analytics' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Product research' }),
    ).not.toBeChecked();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});
