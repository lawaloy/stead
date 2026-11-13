import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import DashboardScreen from '../../app/(app)/dashboard';
import { getDashboardStability } from '../lib/api';

jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
}));
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
jest.mock('../lib/api', () => ({ getDashboardStability: jest.fn() }));

const mockDashboard = jest.mocked(getDashboardStability);

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <DashboardScreen />
    </QueryClientProvider>,
  );

describe('dashboard screen initial-load retry busy guard', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await client.cancelQueries();
    client.clear();
  });

  it('replaces failed-load retry with loading while a cold-start refetch is in flight', async () => {
    mockDashboard.mockRejectedValue(new Error('Offline'));
    await renderScreen(client);

    expect(
      await screen.findByRole(
        'alert',
        {
          name: 'Could not load dashboard. Check your connection and retry.',
        },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();

    mockDashboard.mockImplementation(() => new Promise(() => undefined));
    // Do not await press: refetch returns the hanging getDashboardStability promise.
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole(
        'progressbar',
        { name: 'Loading stability metrics...' },
        { timeout: 3_000 },
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retrying...' })).toBeNull();
    expect(
      screen.queryByRole('alert', {
        name: 'Could not load dashboard. Check your connection and retry.',
      }),
    ).toBeNull();
  });
});
