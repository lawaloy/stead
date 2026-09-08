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

describe('notification preference controls', () => {
  beforeEach(() => {
    queryClient.clear();
    mockGet.mockResolvedValue(preferences);
    mockUpdate.mockResolvedValue({
      ...preferences,
      weeklySummaryEnabled: true,
      riskAlertsEnabled: true,
      weeklyDay: 5,
      weeklyHourLocal: 18,
      updatedAt: '2026-09-07T10:00:00.000Z',
    });
  });

  it('loads opt-in state and saves accessible schedule controls', async () => {
    await renderScreen();
    const weekly = await screen.findByRole('switch', {
      name: 'Weekly summary',
    });
    const risk = screen.getByRole('switch', {
      name: 'Risk and recovery alerts',
    });
    expect(weekly).not.toBeChecked();
    expect(risk).not.toBeChecked();

    await fireEvent.press(weekly);
    await fireEvent.press(risk);
    await fireEvent.press(screen.getByRole('radio', { name: 'Fri' }));
    await fireEvent.changeText(
      screen.getByLabelText('Weekly delivery hour'),
      '18',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save preferences' }),
    );

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        weeklySummaryEnabled: true,
        riskAlertsEnabled: true,
        timeZone: 'Africa/Lagos',
        weeklyDay: 5,
        weeklyHourLocal: 18,
      }),
    );
    expect(await screen.findByText('Preferences saved')).toBeOnTheScreen();
  });

  it('blocks an invalid delivery hour', async () => {
    await renderScreen();
    await screen.findByText('Weekly summary');
    await fireEvent.changeText(
      screen.getByLabelText('Weekly delivery hour'),
      '24',
    );
    expect(
      screen.getByRole('button', { name: 'Save preferences' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid time zone and an hour from 0 to 23.',
    );
  });
});
