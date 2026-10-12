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

const savedPreferences: AlertPreferences = {
  ...preferences,
  weeklySummaryEnabled: true,
  riskAlertsEnabled: true,
  weeklyDay: 5,
  weeklyHourLocal: 18,
  updatedAt: '2026-09-07T10:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AlertsScreen />
    </QueryClientProvider>,
  );

describe('alerts screen save query cache', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue(savedPreferences);
  });

  it('writes saved preferences into the session alerts cache', async () => {
    await renderScreen();
    await screen.findByText('Weekly summary');

    await fireEvent.press(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    );
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Risk and recovery alerts' }),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Fri' }));
    await fireEvent.changeText(
      screen.getByLabelText('Weekly delivery hour'),
      '18',
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        weeklySummaryEnabled: true,
        riskAlertsEnabled: true,
        timeZone: 'Africa/Lagos',
        weeklyDay: 5,
        weeklyHourLocal: 18,
      }),
    );
    expect(
      await screen.findByRole('alert', { name: 'Preferences saved' }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(
      queryClient.getQueryData(
        sessionQueryKeys.alertPreferences('session-token'),
      ),
    ).toEqual(savedPreferences);
    expect(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Risk and recovery alerts' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Fri' })).toBeSelected();
    expect(screen.getByLabelText('Weekly delivery hour')).toHaveProp(
      'value',
      '18',
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
