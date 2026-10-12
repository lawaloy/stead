import React, { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { logoutSession } from '../lib/api';
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

const mockLogoutSession = jest.mocked(logoutSession);
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockGetRefreshToken = jest.mocked(tokenStore.getRefreshToken);
const mockSetSession = jest.mocked(tokenStore.setSession);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const { token, completeAuth, logout, sessionEndReason } = useAuth();
  const [logoutError, setLogoutError] = useState('none');
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
      <Text>
        {sessionEndReason ? `ended:${sessionEndReason}` : 'ended:none'}
      </Text>
      <Text>{`logout-error:${logoutError}`}</Text>
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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void logout().catch((error: Error) => {
            setLogoutError(error.message);
          });
        }}
      >
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
};

describe('AuthProvider logout refresh-token read failure', () => {
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

  it('keeps the local session when getRefreshToken rejects before server revoke', async () => {
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

    mockGetRefreshToken.mockRejectedValueOnce(
      new Error('secure-store-refresh-unavailable'),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });

    await waitFor(() =>
      expect(
        screen.getByText('logout-error:secure-store-refresh-unavailable'),
      ).toBeOnTheScreen(),
    );
    expect(mockLogoutSession).not.toHaveBeenCalled();
    expect(mockClearToken).not.toHaveBeenCalled();
    expect(screen.getByText('new-token')).toBeOnTheScreen();
    expect(screen.getByText('ended:none')).toBeOnTheScreen();
    expect(storedToken).toBe('new-token');
    expect(storedRefresh).toBe('new-refresh');
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'new-token']),
    ).toEqual({ ok: true });
  });
});
