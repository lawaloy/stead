import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
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

const account = {
  profile: {
    id: 'user_1',
    phone: '+2348012345678',
    displayName: 'Ada',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  consents: {
    analyticsEnabled: false,
    productResearchEnabled: false,
    updatedAt: null,
  },
};

const mockDelete = jest.mocked(deleteAccount);
const mockGet = jest.mocked(getAccount);

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AccountScreen />
    </QueryClientProvider>,
  );

describe('account screen delete confirmation case', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(account);
    jest.mocked(updateAccountProfile).mockResolvedValue(account);
    jest.mocked(updateAccountConsents).mockResolvedValue(account);
    jest.mocked(exportAccountData).mockResolvedValue({
      schemaVersion: 1,
      exportedAt: '2026-09-08T12:00:00.000Z',
      profile: account.profile,
      consents: account.consents,
      consentHistory: [],
      goals: [],
      transactions: [],
      alertPreferences: null,
      authHistory: [],
      notificationHistory: [],
    });
    mockDelete.mockResolvedValue({
      ok: true,
      deletedAt: '2026-09-08T12:00:00.000Z',
    });
    logout.mockResolvedValue(undefined);
  });

  it('requires an exact DELETE confirmation before enabling permanent deletion', async () => {
    await renderScreen();
    await screen.findByText('+2348012345678');

    const deleteButtonName = 'Delete account permanently';
    const typeConfirmation = async (value: string) => {
      fireEvent.changeText(
        screen.getByLabelText('Delete account confirmation'),
        value,
      );
      await waitFor(() =>
        expect(
          screen.getByLabelText('Delete account confirmation').props.value,
        ).toBe(value),
      );
    };

    await typeConfirmation('delete');
    expect(
      screen.getByRole('button', { name: deleteButtonName }),
    ).toBeDisabled();

    await typeConfirmation('Delete');
    expect(
      screen.getByRole('button', { name: deleteButtonName }),
    ).toBeDisabled();

    await typeConfirmation('DELETE ');
    expect(
      screen.getByRole('button', { name: deleteButtonName }),
    ).toBeDisabled();

    expect(mockDelete).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();

    await typeConfirmation('DELETE');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: deleteButtonName }),
      ).not.toBeDisabled(),
    );
  });
});
