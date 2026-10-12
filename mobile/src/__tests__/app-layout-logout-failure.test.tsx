import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AppLayout from '../../app/(app)/_layout';
import { useAuth } from '../lib/auth-state';

const replace = jest.fn();
const logout = jest.fn();

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    Stack: ({
      screenOptions,
    }: {
      screenOptions?: { headerRight?: () => React.ReactNode };
    }) =>
      ReactModule.createElement(
        ReactModule.Fragment,
        null,
        screenOptions?.headerRight?.(),
      ),
    Link: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('Text', null, children),
    useRouter: () => ({ replace }),
  };
});
jest.mock('../lib/auth-state', () => ({
  useAuth: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('View', null, children),
  };
});

const mockAuth = jest.mocked(useAuth);

describe('app layout logout failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logout.mockRejectedValue(new Error('Local session clear failed'));
    mockAuth.mockReturnValue({
      token: 'session-token',
      logout,
    } as never);
  });

  it('keeps the authenticated shell when header logout rejects', async () => {
    const view = await render(<AppLayout />);

    await act(async () => {
      await Promise.resolve(fireEvent.press(view.getByText('Logout'))).catch(
        (error: unknown) => {
          if (
            !(error instanceof Error) ||
            error.message !== 'Local session clear failed'
          ) {
            throw error;
          }
        },
      );
    });

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(replace).not.toHaveBeenCalled();
    expect(view.getByText('Logout')).toBeOnTheScreen();
  });
});
