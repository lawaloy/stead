import React from 'react';
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
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const { token, logout, sessionEndReason } = useAuth();
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
      <Text>
        {sessionEndReason ? `ended:${sessionEndReason}` : 'ended:none'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout({ allDevices: true })}
      >
        <Text>Sign out everywhere</Text>
      </Pressable>
    </View>
  );
};

describe('AuthProvider sign-out-everywhere without a stored refresh token', () => {
  let storedToken: string | null;
  let storedRefresh: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = 'orphan-access';
    storedRefresh = null;
    mockGetToken.mockImplementation(async () => storedToken);
    mockGetRefreshToken.mockImplementation(async () => storedRefresh);
    mockClearToken.mockImplementation(async () => {
      storedToken = null;
      storedRefresh = null;
    });
    mockLogoutSession.mockResolvedValue({ ok: true });
  });

  it('still sends allDevices so the access JWT can revoke every live family', async () => {
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('orphan-access')).toBeOnTheScreen();
    queryClient.setQueryData(['dashboard', 'stability', 'orphan-access'], {
      ok: true,
    });

    await act(async () => {
      fireEvent.press(
        screen.getByRole('button', { name: 'Sign out everywhere' }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText('signed out')).toBeOnTheScreen(),
    );

    expect(mockLogoutSession).toHaveBeenCalledWith({
      refreshToken: null,
      allDevices: true,
    });
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(storedToken).toBeNull();
    expect(storedRefresh).toBeNull();
    expect(screen.getByText('ended:none')).toBeOnTheScreen();
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'orphan-access']),
    ).toBeUndefined();
  });
});
