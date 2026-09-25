import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
import { useAuth } from '../lib/auth-state';

const replace = jest.fn();
let segments: string[] = ['(app)', 'dashboard'];

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    Stack: () => ReactModule.createElement('Text', null, 'signed-in stack'),
    useRouter: () => ({ replace }),
    useSegments: () => segments,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      children as React.ReactElement,
  };
});
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});
jest.mock('../lib/auth-state', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) =>
    children as React.ReactElement,
  useAuth: jest.fn(),
}));

const mockAuth = jest.mocked(useAuth);

describe('root layout auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    segments = ['(app)', 'dashboard'];
    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: null,
    } as never);
  });

  it('shows a spinner and does not redirect while the session is restoring', async () => {
    mockAuth.mockReturnValue({
      bootstrapping: true,
      token: null,
    } as never);

    const view = await render(<RootLayout />);

    expect(view.queryByText('signed-in stack')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends unauthenticated users away from app routes', async () => {
    const view = await render(<RootLayout />);

    expect(view.getByText('signed-in stack')).toBeTruthy();
    expect(replace).toHaveBeenCalledWith('/(auth)/request-otp');
  });

  it('sends authenticated users away from auth routes', async () => {
    segments = ['(auth)', 'verify-otp'];
    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: 'session-token',
    } as never);

    await render(<RootLayout />);

    expect(replace).toHaveBeenCalledWith('/(app)/dashboard');
  });

  it('does not bounce users who are already on the matching route group', async () => {
    segments = ['(auth)', 'request-otp'];
    await render(<RootLayout />);
    expect(replace).not.toHaveBeenCalled();

    segments = ['(app)', 'dashboard'];
    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: 'session-token',
    } as never);
    await render(<RootLayout />);
    expect(replace).not.toHaveBeenCalled();
  });
});
