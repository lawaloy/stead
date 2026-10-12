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
  const { token, completeAuth, sessionEndReason } = useAuth();
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
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
    </View>
  );
};

describe('AuthProvider silent refresh persist failure', () => {
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

  it('keeps the current access token when rotated credentials cannot be persisted', async () => {
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

    const authConfig = mockConfigureApiAuth.mock.calls.at(-1)?.[0] as {
      persistSession: (session: {
        token: string;
        refreshToken: string;
      }) => Promise<void>;
    };
    mockSetSession.mockRejectedValueOnce(
      new Error('secure-store-write-failed'),
    );

    await expect(
      act(async () => {
        await authConfig.persistSession({
          token: 'rotated-token',
          refreshToken: 'rotated-refresh',
        });
      }),
    ).rejects.toThrow('secure-store-write-failed');

    expect(mockSetSession).toHaveBeenCalledWith({
      token: 'rotated-token',
      refreshToken: 'rotated-refresh',
    });
    expect(screen.getByText('new-token')).toBeOnTheScreen();
    expect(screen.queryByText('rotated-token')).toBeNull();
    expect(screen.getByText('ended:none')).toBeOnTheScreen();
    expect(storedToken).toBe('new-token');
    expect(storedRefresh).toBe('new-refresh');
    expect(mockClearToken).not.toHaveBeenCalled();
    expect(mockLogoutSession).not.toHaveBeenCalled();
  });
});
