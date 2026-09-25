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
  weeklySummaryEnabled: true,
  riskAlertsEnabled: true,
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

describe('alerts screen midnight weekly hour', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue({
      ...preferences,
      weeklyHourLocal: 0,
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
  });

  it('saves hour 0 so a midnight weekly summary is not treated as invalid', async () => {
    await renderScreen();
    expect(await screen.findByLabelText('Weekly delivery hour')).toHaveProp(
      'value',
      '9',
    );
    expect(
      screen.getByRole('button', { name: 'Save preferences' }),
    ).toBeEnabled();

    await fireEvent.changeText(
      screen.getByLabelText('Weekly delivery hour'),
      '0',
    );
    expect(screen.getByLabelText('Weekly delivery hour')).toHaveProp(
      'value',
      '0',
    );
    expect(
      screen.getByRole('button', { name: 'Save preferences' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        weeklySummaryEnabled: true,
        riskAlertsEnabled: true,
        timeZone: 'Africa/Lagos',
        weeklyDay: 1,
        weeklyHourLocal: 0,
      }),
    );
    expect(await screen.findByText('Preferences saved')).toBeOnTheScreen();
  });
});
