import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import {
  abandonInFlightRefresh,
  configureApiAuth,
  logoutSession,
  waitForInFlightRefresh,
} from '../lib/api';
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
const mockAbandonInFlightRefresh = jest.mocked(abandonInFlightRefresh);
const mockWaitForInFlightRefresh = jest.mocked(waitForInFlightRefresh);
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

describe('AuthProvider logout vs in-flight refresh', () => {
  let storedToken: string | null;
  let storedRefresh: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = null;
    storedRefresh = null;
    mockWaitForInFlightRefresh.mockReturnValue(null);
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

  const signIn = async () => {
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
  };

  it('waits for an in-flight refresh before clearing credentials or revoking', async () => {
    let releaseRefresh: ((value: string | null) => void) | undefined;
    mockWaitForInFlightRefresh.mockReturnValue(
      new Promise<string | null>((resolve) => {
        releaseRefresh = resolve;
      }),
    );

    await signIn();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });

    await waitFor(() =>
      expect(mockAbandonInFlightRefresh).toHaveBeenCalledTimes(1),
    );
    expect(mockWaitForInFlightRefresh).toHaveBeenCalled();
    expect(mockClearToken).not.toHaveBeenCalled();
    expect(mockLogoutSession).not.toHaveBeenCalled();
    expect(screen.getByText('new-token')).toBeOnTheScreen();
    expect(storedToken).toBe('new-token');
    expect(storedRefresh).toBe('new-refresh');

    await act(async () => {
      releaseRefresh?.(null);
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(mockLogoutSession).toHaveBeenCalledWith({
      refreshToken: 'new-refresh',
      allDevices: undefined,
    });
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
  });

  it('drops local credentials before the server revoke starts', async () => {
    await signIn();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );

    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(mockLogoutSession).toHaveBeenCalledTimes(1);
    expect(mockClearToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockLogoutSession.mock.invocationCallOrder[0],
    );
  });

  it('discards a refresh persist that writes after logout has started', async () => {
    await signIn();

    const authConfig = mockConfigureApiAuth.mock.calls.at(-1)?.[0] as {
      persistSession: (session: {
        token: string;
        refreshToken: string;
      }) => Promise<void>;
    };

    const setSessionCallsAfterLogin = mockSetSession.mock.calls.length;
    let releasePersist: (() => void) | undefined;
    mockSetSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releasePersist = () => {
            storedToken = 'rotated-token';
            storedRefresh = 'rotated-refresh';
            resolve();
          };
        }),
    );

    let persistDone: Promise<void> | undefined;
    await act(async () => {
      persistDone = authConfig.persistSession({
        token: 'rotated-token',
        refreshToken: 'rotated-refresh',
      });
    });
    await waitFor(() =>
      expect(mockSetSession.mock.calls.length).toBe(
        setSessionCallsAfterLogin + 1,
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );
    expect(storedToken).toBeNull();

    await act(async () => {
      releasePersist?.();
      await persistDone;
    });

    expect(screen.getByText('signed out')).toBeOnTheScreen();
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
    expect(mockClearToken).toHaveBeenCalled();
  });
});
