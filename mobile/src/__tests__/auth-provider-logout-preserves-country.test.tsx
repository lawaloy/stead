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
const mockSetSession = jest.mocked(tokenStore.setSession);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const {
    token,
    completeAuth,
    logout,
    pendingCountryIso,
    pendingPhone,
    setPendingCountryIso,
    setPendingPhone,
  } = useAuth();
  return (
    <View>
      <Text>{token ?? 'signed out'}</Text>
      <Text>{`country:${pendingCountryIso}`}</Text>
      <Text>{`phone:${pendingPhone || 'none'}`}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPendingCountryIso('US');
          setPendingPhone('+14155552671');
        }}
      >
        <Text>Choose US phone</Text>
      </Pressable>
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

describe('AuthProvider logout preserves pending country', () => {
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

  it('clears the pending phone on logout but keeps the chosen OTP country', async () => {
    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed out')).toBeOnTheScreen();
    expect(screen.getByText('country:NG')).toBeOnTheScreen();
    expect(screen.getByText('phone:none')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Choose US phone' }));
    });
    expect(screen.getByText('country:US')).toBeOnTheScreen();
    expect(screen.getByText('phone:+14155552671')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Complete login' }));
    });
    await waitFor(() =>
      expect(screen.getByText('new-token')).toBeOnTheScreen(),
    );
    expect(screen.getByText('country:US')).toBeOnTheScreen();
    expect(screen.getByText('phone:none')).toBeOnTheScreen();

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
    expect(screen.getByText('country:US')).toBeOnTheScreen();
    expect(screen.getByText('phone:none')).toBeOnTheScreen();
  });
});
