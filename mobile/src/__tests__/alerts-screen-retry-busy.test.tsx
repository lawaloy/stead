import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AlertsScreen from '../../app/(app)/alerts';
import { getAlertPreferences, updateAlertPreferences } from '../lib/api';
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
const preferences = {
  weeklySummaryEnabled: false,
  riskAlertsEnabled: false,
  channel: 'sms' as const,
  timeZone: 'Africa/Lagos',
  weeklyDay: 1,
  weeklyHourLocal: 9,
  updatedAt: null,
};

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <AlertsScreen />
    </QueryClientProvider>,
  );

describe('alerts screen retry busy guard', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
    jest.mocked(updateAlertPreferences).mockResolvedValue(preferences);
  });

  afterEach(async () => {
    await client.cancelQueries();
    client.clear();
  });

  it('disables retry while a background preferences refresh is in flight', async () => {
    client.setQueryData(
      sessionQueryKeys.alertPreferences('session-token'),
      preferences,
      { updatedAt: 0 },
    );
    mockGet.mockRejectedValue(new Error('Offline'));
    await renderScreen(client);

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

    mockGet.mockImplementation(() => new Promise(() => undefined));
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole(
        'button',
        { name: 'Retrying...' },
        { timeout: 3_000 },
      ),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(
      screen.getByRole('switch', { name: 'Weekly summary' }),
    ).toBeOnTheScreen();
  });
});
