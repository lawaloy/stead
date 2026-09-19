import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { configureApiAuth } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth-state';
import { queryClient } from '../lib/query-client';
import { tokenStore } from '../lib/token-store';

jest.mock('../lib/api', () => ({ configureApiAuth: jest.fn() }));
jest.mock('../lib/token-store', () => ({
  tokenStore: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
  },
}));

const mockConfigureApiAuth = jest.mocked(configureApiAuth);
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockSetToken = jest.mocked(tokenStore.setToken);
const mockClearToken = jest.mocked(tokenStore.clearToken);

const SessionProbe = () => {
  const { bootstrapping, token, completeAuth, logout } = useAuth();
  return (
    <View>
      <Text>{bootstrapping ? 'restoring' : (token ?? 'signed out')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void completeAuth('new-token')}
      >
        <Text>Complete login</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void logout()}>
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
};

describe('AuthProvider session lifecycle', () => {
  let storedToken: string | null;

  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    storedToken = null;
    mockGetToken.mockImplementation(async () => storedToken);
    mockSetToken.mockImplementation(async (token) => {
      storedToken = token;
    });
    mockClearToken.mockImplementation(async () => {
      storedToken = null;
    });
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
    expect(mockSetToken).toHaveBeenCalledWith('new-token');
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
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(storedToken).toBeNull();
    expect(
      queryClient.getQueryData(['dashboard', 'stability', 'new-token']),
    ).toBeUndefined();
    expect(mockConfigureApiAuth).toHaveBeenCalled();
  });
});
