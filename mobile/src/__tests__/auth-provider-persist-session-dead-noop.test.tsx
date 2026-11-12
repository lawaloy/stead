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

const mockConfigureApiAuth = jest.mocked(configureApiAuth);
const mockLogoutSession = jest.mocked(logoutSession);
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockGetRefreshToken = jest.mocked(tokenStore.getRefreshToken);
const mockSetSession = jest.mocked(tokenStore.setSession);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const { token, completeAuth, logout } = useAuth();
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
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
    </View>
  );
};

describe('AuthProvider persistSession after logout', () => {
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

  it('does not write credentials when persistSession runs after logout', async () => {
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

    const setSessionCallsAfterLogin = mockSetSession.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );

    const authConfig = mockConfigureApiAuth.mock.calls.at(-1)?.[0] as {
      persistSession: (session: {
        token: string;
        refreshToken: string;
      }) => Promise<void>;
    };

    await act(async () => {
      await authConfig.persistSession({
        token: 'resurrected-jwt',
        refreshToken: 'resurrected-refresh',
      });
    });

    expect(mockSetSession.mock.calls.length).toBe(setSessionCallsAfterLogin);
    expect(screen.getByText('signed out')).toBeOnTheScreen();
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
  });
});
