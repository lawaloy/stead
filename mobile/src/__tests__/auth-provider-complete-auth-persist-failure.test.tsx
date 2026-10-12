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
  const { token, completeAuth, sessionEndReason } = useAuth();
  const [authError, setAuthError] = useState('none');
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
      <Text>
        {sessionEndReason ? `ended:${sessionEndReason}` : 'ended:none'}
      </Text>
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
    </View>
  );
};

describe('AuthProvider completeAuth persist failure', () => {
  let storedToken: string | null;
  let storedRefresh: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = null;
    storedRefresh = null;
    mockGetToken.mockImplementation(async () => storedToken);
    mockGetRefreshToken.mockImplementation(async () => storedRefresh);
    mockSetSession.mockRejectedValue(new Error('secure-store-write-failed'));
    mockClearToken.mockImplementation(async () => {
      storedToken = null;
      storedRefresh = null;
    });
    mockLogoutSession.mockResolvedValue({ ok: true });
  });

  it('stays signed out when SecureStore persistence fails after cache clear', async () => {
    await render(
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
      expect(
        screen.getByText('auth-error:secure-store-write-failed'),
      ).toBeOnTheScreen(),
    );
    expect(mockSetSession).toHaveBeenCalledWith({
      token: 'new-token',
      refreshToken: 'new-refresh',
    });
    expect(screen.getByText('signed out')).toBeOnTheScreen();
    expect(screen.getByText('ended:none')).toBeOnTheScreen();
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
    expect(mockClearToken).not.toHaveBeenCalled();
    expect(mockLogoutSession).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'old-token']),
    ).toBeUndefined();
  });
});
