import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AlertsScreen from '../../app/(app)/alerts';
import type { AlertPreferences } from '../contracts/generated/types.gen';
import { getAlertPreferences, updateAlertPreferences } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { sessionQueryKeys } from '../lib/session-query-cache';

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
const preferences: AlertPreferences = {
  weeklySummaryEnabled: false,
  riskAlertsEnabled: false,
  channel: 'sms',
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

describe('alerts screen save query cache failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockRejectedValue(new Error('Offline'));
  });

  it('keeps the loaded preferences in cache when save is rejected', async () => {
    await renderScreen();
    await screen.findByText('Weekly summary');
    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          sessionQueryKeys.alertPreferences('session-token'),
        ),
      ).toEqual(preferences),
    );

    await fireEvent.press(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    });

    expect(
      await screen.findByRole('alert', {
        name: 'Could not save preferences. Check the time zone and retry.',
      }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.queryByText('Preferences saved')).toBeNull();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData(
        sessionQueryKeys.alertPreferences('session-token'),
      ),
    ).toEqual(preferences);
    expect(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    ).toBeChecked();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
