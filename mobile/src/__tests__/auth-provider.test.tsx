import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { configureApiAuth, logoutSession } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth-state';
import { queryClient } from '../lib/query-client';
import { tokenStore } from '../lib/token-store';

jest.mock('../lib/api', () => ({
  configureApiAuth: jest.fn(),
  logoutSession: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('../lib/token-store', () => ({
  tokenStore: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    getRefreshToken: jest.fn(),
    setRefreshToken: jest.fn(),
    setSession: jest.fn(),
    clearToken: jest.fn(),
  },
}));

const mockConfigureApiAuth = jest.mocked(configureApiAuth);
const mockLogoutSession = jest.mocked(logoutSession);
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockGetRefreshToken = jest.mocked(tokenStore.getRefreshToken);
const mockSetSession = jest.mocked(tokenStore.setSession);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const {
    bootstrapping,
    token,
    completeAuth,
    logout,
    sessionEndReason,
    clearSessionEndReason,
  } = useAuth();
  return (
    <View>
      <Text>{bootstrapping ? 'restoring' : (token ?? 'signed out')}</Text>
      <Text>
        {sessionEndReason ? `ended:${sessionEndReason}` : 'ended:none'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void completeAuth({
            token: 'new-token',
            refreshToken: 'new-refresh',
          })
        }
      >
        <Text>Complete login</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void logout()}>
        <Text>Log out</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout({ allDevices: true })}
      >
        <Text>Sign out everywhere</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout({ reason: 'expired' })}
      >
        <Text>Expire session</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => clearSessionEndReason()}
      >
        <Text>Clear end reason</Text>
      </Pressable>
    </View>
  );
};

describe('AuthProvider session lifecycle', () => {
  let storedToken: string | null;
  let storedRefresh: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = null;
    storedRefresh = null;
    mockGetToken.mockImplementation(async () => storedToken);
    mockGetRefreshToken.mockImplementation(async () => storedRefresh);
    mockSetSession.mockImplementation(async (session) => {
      storedToken = session.token;
      storedRefresh = session.refreshToken;
    });
    mockClearToken.mockImplementation(async () => {
      storedToken = null;
      storedRefresh = null;
    });
    mockLogoutSession.mockResolvedValue({ ok: true });
  });

  it('persists login, restores it after remount, and clears session data on logout', async () => {
    const first = await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed out')).toBeOnTheScreen();
    queryClient.setQueryData(['dashboard', 'stability', 'old-token'], {
      ok: true,
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Complete login' }));
    });
    await waitFor(() =>
      expect(screen.getByText('new-token')).toBeOnTheScreen(),
    );
    expect(mockSetSession).toHaveBeenCalledWith({
      token: 'new-token',
      refreshToken: 'new-refresh',
    });
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'old-token']),
    ).toBeUndefined();

    await act(async () => first.unmount());
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('new-token')).toBeOnTheScreen();
    queryClient.setQueryData(['dashboard', 'stability', 'new-token'], {
      ok: true,
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    expect(mockLogoutSession).toHaveBeenCalledWith({
      refreshToken: 'new-refresh',
      allDevices: undefined,
    });
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'new-token']),
    ).toBeUndefined();
    expect(mockConfigureApiAuth).toHaveBeenCalled();
  });

  it('passes allDevices when signing out everywhere', async () => {
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed out')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Complete login' }));
    });
    await waitFor(() =>
      expect(screen.getByText('new-token')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Sign out everywhere' }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    expect(mockLogoutSession).toHaveBeenCalledWith({
      refreshToken: 'new-refresh',
      allDevices: true,
    });
  });

  it('clears the session when the API reports unauthorized', async () => {
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed out')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Complete login' }));
    });
    await waitFor(() =>
      expect(screen.getByText('new-token')).toBeOnTheScreen(),
    );
    queryClient.setQueryData(['dashboard', 'stability', 'new-token'], {
      ok: true,
    });

    const authConfig = mockConfigureApiAuth.mock.calls.at(-1)?.[0] as {
      onUnauthorized: (options?: { reason?: 'expired' }) => Promise<void>;
    };
    await act(async () => {
      await authConfig.onUnauthorized({ reason: 'expired' });
    });

    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    expect(mockLogoutSession).toHaveBeenCalledWith({
      refreshToken: 'new-refresh',
      allDevices: undefined,
    });
    expect(screen.getByText('ended:expired')).toBeOnTheScreen();
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(storedToken).toBeNull();
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'new-token']),
    ).toBeUndefined();
  });

  it('records and clears an expired-session reason for the login screen', async () => {
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('ended:none')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Expire session' }));
    });
    await waitFor(() =>
      expect(screen.getByText('ended:expired')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Clear end reason' }));
    });
    expect(screen.getByText('ended:none')).toBeOnTheScreen();
  });
});
