import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
import { useAuth } from '../lib/auth-state';

const replace = jest.fn();
const push = jest.fn();

// Minimal Stack that mirrors expo-router's Stack.Protected semantics: a screen
// is registered only when every enclosing guard is true. The test renders the
// registered screen names in order, so `[0]` is the screen the root stack
// starts on (React Navigation uses the first route name when the URL's route,
// here `index`, is not registered).
jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  type Props = { children?: React.ReactNode; guard?: boolean; name?: string };
  const Screen = (_props: Props) => null;
  const Protected = (_props: Props) => null;
  const collect = (children: React.ReactNode, allowed: boolean): string[] =>
    ReactModule.Children.toArray(children).flatMap((child) => {
      if (!ReactModule.isValidElement<Props>(child)) return [];
      if (child.type === Protected) {
        return collect(
          child.props.children,
          allowed && Boolean(child.props.guard),
        );
      }
      if (child.type === Screen && allowed && child.props.name) {
        return [child.props.name];
      }
      return [];
    });
  const Stack = ({ children }: Props) =>
    ReactModule.createElement(
      Text,
      { testID: 'root-stack' },
      collect(children, true).join(','),
    );
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return {
    Stack,
    useRouter: () => ({ replace, push }),
    useSegments: () => [],
    Redirect: () => null,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
    children as React.ReactElement,
}));
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

const registeredScreens = (view: Awaited<ReturnType<typeof render>>) =>
  String(view.getByTestId('root-stack').props.children).split(',');

describe('root layout auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: null,
    } as never);
  });

  it('shows a spinner and mounts no navigator while the session is restoring', async () => {
    mockAuth.mockReturnValue({
      bootstrapping: true,
      token: null,
    } as never);

    const view = await render(<RootLayout />);

    expect(view.queryByTestId('root-stack')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('starts signed-out users directly on request OTP without a redirect', async () => {
    const view = await render(<RootLayout />);

    expect(registeredScreens(view)).toEqual([
      '(auth)/request-otp',
      '(auth)/verify-otp',
    ]);
    // Mounting `index` and redirecting away during the navigator's first
    // appearance is what left an untouchable empty screen on iOS 26.
    expect(registeredScreens(view)).not.toContain('index');
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('starts signed-in users directly in the app group without a redirect', async () => {
    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: 'session-token',
    } as never);

    const view = await render(<RootLayout />);

    expect(registeredScreens(view)).toEqual(['(app)']);
    expect(registeredScreens(view)).not.toContain('index');
    expect(replace).not.toHaveBeenCalled();
  });

  it('swaps screen groups when the token changes instead of navigating imperatively', async () => {
    const view = await render(<RootLayout />);
    expect(registeredScreens(view)).toEqual([
      '(auth)/request-otp',
      '(auth)/verify-otp',
    ]);

    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: 'session-token',
    } as never);
    await view.rerender(<RootLayout />);
    expect(registeredScreens(view)).toEqual(['(app)']);

    mockAuth.mockReturnValue({
      bootstrapping: false,
      token: null,
    } as never);
    await view.rerender(<RootLayout />);
    expect(registeredScreens(view)).toEqual([
      '(auth)/request-otp',
      '(auth)/verify-otp',
    ]);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
