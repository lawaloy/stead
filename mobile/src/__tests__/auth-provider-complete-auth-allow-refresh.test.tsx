import React, { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { allowTokenRefresh, logoutSession } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth-state';
import { queryClient } from '../lib/query-client';
import { tokenStore } from '../lib/token-store';

jest.mock('../lib/api', () => ({
  configureApiAuth: jest.fn(),
  logoutSession: jest.fn().mockResolvedValue({ ok: true }),
  abandonInFlightRefresh: jest.fn(),
  allowTokenRefresh: jest.fn(),
  waitForInFlightRefresh: jest.fn(() => null),
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

const mockLogoutSession = jest.mocked(logoutSession);
const mockAllowTokenRefresh = jest.mocked(allowTokenRefresh);
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockGetRefreshToken = jest.mocked(tokenStore.getRefreshToken);
const mockSetSession = jest.mocked(tokenStore.setSession);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const { token, completeAuth, logout } = useAuth();
  const [authError, setAuthError] = useState('none');
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
      <Text>{`auth-error:${authError}`}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void completeAuth({
            token: 'new-token',
            refreshToken: 'new-refresh',
          }).catch((error: Error) => {
            setAuthError(error.message);
          });
        }}
      >
        <Text>Complete login</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void logout()}>
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
};

describe('AuthProvider completeAuth re-enables refresh', () => {
  let storedToken: string | null;
  let storedRefresh: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = null;
    storedRefresh = null;
    mockLogoutSession.mockResolvedValue({ ok: true });
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
  });

  it('re-enables silent refresh after logout once the new session is persisted', async () => {
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
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    mockAllowTokenRefresh.mockClear();
    mockSetSession.mockClear();

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
    expect(mockAllowTokenRefresh).toHaveBeenCalledTimes(1);
    expect(mockSetSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockAllowTokenRefresh.mock.invocationCallOrder[0],
    );
  });

  it('does not re-enable refresh when SecureStore persistence fails', async () => {
    mockSetSession.mockRejectedValue(new Error('secure-store-write-failed'));

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
      expect(
        screen.getByText('auth-error:secure-store-write-failed'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByText('signed out')).toBeOnTheScreen();
    expect(mockAllowTokenRefresh).not.toHaveBeenCalled();
  });
});
