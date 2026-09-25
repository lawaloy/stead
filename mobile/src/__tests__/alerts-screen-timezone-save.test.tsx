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

describe('alerts screen timezone save', () => {
  beforeEach(() => {
    queryClient.clear();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue({
      ...preferences,
      timeZone: 'Europe/London',
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
  });

  it('persists a customer-edited IANA timezone', async () => {
    await renderScreen();
    await screen.findByDisplayValue('Africa/Lagos');

    await fireEvent.changeText(
      screen.getByLabelText('IANA time zone'),
      'Europe/London',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        weeklySummaryEnabled: true,
        riskAlertsEnabled: true,
        timeZone: 'Europe/London',
        weeklyDay: 1,
        weeklyHourLocal: 9,
      }),
    );
    expect(await screen.findByText('Preferences saved')).toBeOnTheScreen();
  });
});
