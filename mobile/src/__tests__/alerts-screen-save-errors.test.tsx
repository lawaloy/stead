import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AlertsScreen from '../../app/(app)/alerts';
import { getAlertPreferences, updateAlertPreferences } from '../lib/api';
import { queryClient } from '../lib/query-client';

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});
jest.mock('../lib/auth-state', () => ({
  useAuth: () => ({ token: 'session-token' }),
}));
jest.mock('../lib/api', () => ({
  getAlertPreferences: jest.fn(),
  updateAlertPreferences: jest.fn(),
}));

const mockGet = jest.mocked(getAlertPreferences);
const mockUpdate = jest.mocked(updateAlertPreferences);
const preferences = {
  weeklySummaryEnabled: false,
  riskAlertsEnabled: false,
  channel: 'sms' as const,
  timeZone: 'Africa/Lagos',
  weeklyDay: 1,
  weeklyHourLocal: 9,
  updatedAt: null,
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AlertsScreen />
    </QueryClientProvider>,
  );

describe('alerts screen save failures', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue({
      ...preferences,
      weeklySummaryEnabled: true,
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
  });

  it('blocks save when the time zone is blank', async () => {
    await renderScreen();
    await screen.findByText('Weekly summary');

    await fireEvent.changeText(screen.getByLabelText('IANA time zone'), '   ');

    expect(
      screen.getByRole('button', { name: 'Save preferences' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid time zone and an hour from 0 to 23.',
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('shows a save-failure alert when the API rejects the update', async () => {
    mockUpdate.mockRejectedValue(new Error('Offline'));
    await renderScreen();
    await screen.findByText('Weekly summary');

    await fireEvent.press(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    expect(
      await screen.findByRole('alert', {
        name: 'Could not save preferences. Check the time zone and retry.',
      }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText('Preferences saved')).toBeNull();
  });
});
