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
  updatedAt: '2026-09-07T10:00:00.000Z',
};

const renderScreen = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <AlertsScreen />
    </QueryClientProvider>,
  );

describe('alerts screen save busy guard', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue(savedPreferences);
  });

  it('disables save and shows Saving while preferences update is in flight', async () => {
    let resolveUpdate: ((value: AlertPreferences) => void) | undefined;
    mockUpdate.mockImplementation(
      () =>
        new Promise<AlertPreferences>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    await renderScreen();
    await screen.findByText('Weekly summary');
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith({
      weeklySummaryEnabled: true,
      riskAlertsEnabled: false,
      timeZone: 'Africa/Lagos',
      weeklyDay: 1,
      weeklyHourLocal: 9,
    });
    expect(await screen.findByText('Saving...')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.queryByText('Preferences saved')).toBeNull();

    await act(async () => {
      resolveUpdate?.(savedPreferences);
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(await screen.findByText('Preferences saved')).toBeOnTheScreen();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
