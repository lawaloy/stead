import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

describe('app layout logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logout.mockResolvedValue(undefined);
    mockAuth.mockReturnValue({
      token: 'session-token',
      logout,
    } as never);
  });

  it('clears the session and returns to request OTP', async () => {
    const view = await render(<AppLayout />);

    await fireEvent.press(view.getByText('Logout'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
  });
});
