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

describe('alerts screen load failure', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(preferences);
  });

  it('shows a failed-load alert and recovers after retry', async () => {
    mockGet.mockRejectedValue(new Error('Offline'));
    await renderScreen();

    expect(
      await screen.findByRole(
        'alert',
        { name: 'Could not load notification preferences.' },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGet.mockResolvedValue(preferences);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('switch', { name: 'Weekly summary' }),
    ).toBeOnTheScreen();
  });

  it('keeps cached preferences visible when a background refresh fails', async () => {
    queryClient.setQueryData(
      sessionQueryKeys.alertPreferences('session-token'),
      preferences,
      { updatedAt: 0 },
    );
    mockGet.mockRejectedValue(new Error('Offline'));
    await renderScreen();

    expect(
      await screen.findByRole('switch', { name: 'Weekly summary' }),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not refresh notification preferences. Showing your last saved choices.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();

    mockGet.mockResolvedValue(preferences);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          'Could not refresh notification preferences. Showing your last saved choices.',
        ),
      ).not.toBeOnTheScreen(),
    );
    expect(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    ).toBeOnTheScreen();
  });
});
