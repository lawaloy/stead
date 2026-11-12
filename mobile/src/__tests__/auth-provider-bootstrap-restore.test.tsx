import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { configureApiAuth } from '../lib/api';
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
const mockGetToken = jest.mocked(tokenStore.getToken);
const mockSetSession = jest.mocked(tokenStore.setSession);

const SessionProbe = () => {
  const { bootstrapping, token } = useAuth();
  return (
    <View>
      <Text>{bootstrapping ? 'restoring' : (token ?? 'signed out')}</Text>
    </View>
  );
};

describe('AuthProvider cold-start session restore', () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
    mockSetSession.mockResolvedValue(undefined);
  });

  it('keeps the restoring gate until the stored session is read', async () => {
    let releaseRead: ((token: string | null) => void) | undefined;
    mockGetToken.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          releaseRead = resolve;
        }),
    );

    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(screen.getByText('restoring')).toBeOnTheScreen();

    await act(async () => {
      releaseRead?.('stored-jwt');
    });
    expect(await screen.findByText('stored-jwt')).toBeOnTheScreen();
  });

  it('still persists a later refresh after restoring an existing session', async () => {
    mockGetToken.mockResolvedValue('stored-jwt');

    await render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('stored-jwt')).toBeOnTheScreen();

    const authConfig = mockConfigureApiAuth.mock.calls.at(-1)?.[0] as {
      persistSession: (session: {
        token: string;
        refreshToken: string;
      }) => Promise<void>;
    };
    mockSetSession.mockImplementation(async (session) => {
      mockGetToken.mockResolvedValue(session.token);
    });

    await act(async () => {
      await authConfig.persistSession({
        token: 'rotated-jwt',
        refreshToken: 'rotated-refresh',
      });
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      token: 'rotated-jwt',
      refreshToken: 'rotated-refresh',
    });
    expect(screen.getByText('rotated-jwt')).toBeOnTheScreen();
  });
});
