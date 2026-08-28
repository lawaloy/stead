import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tokenStore } from './token-store';
import { configureApiAuth } from './api';
import {
  AuthCountryIso,
  defaultAuthCountryIso,
} from './countries';
import { clearSessionQueryCache } from './session-query-cache';

type AuthContextValue = {
  token: string | null;
  bootstrapping: boolean;
  pendingPhone: string;
  pendingCountryIso: AuthCountryIso;
  pendingOtpRequestedAt: number | null;
  devOtpHint: string;
  setPendingPhone: (phone: string) => void;
  setPendingCountryIso: (countryIso: AuthCountryIso) => void;
  setPendingOtpRequestedAt: (value: number | null) => void;
  setDevOtpHint: (otp: string) => void;
  resetPendingAuth: () => void;
  completeAuth: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingCountryIso, setPendingCountryIso] =
    useState<AuthCountryIso>(defaultAuthCountryIso);
  const [pendingOtpRequestedAt, setPendingOtpRequestedAt] = useState<number | null>(
    null,
  );
  const [devOtpHint, setDevOtpHint] = useState('');

  const logout = useCallback(async () => {
    setToken(null);
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
    await tokenStore.clearToken();
    await clearSessionQueryCache();
  }, []);

  const resetPendingAuth = useCallback(() => {
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
  }, []);

  const completeAuth = useCallback(async (jwt: string) => {
    await clearSessionQueryCache();
    setToken(jwt);
    resetPendingAuth();
    await tokenStore.setToken(jwt);
  }, [resetPendingAuth]);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const existing = await tokenStore.getToken();
      if (!mounted) return;
      setToken(existing);
      setBootstrapping(false);
    };
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    configureApiAuth({
      getToken: async () => token,
      onUnauthorized: async () => {
        await logout();
      },
    });
  }, [logout, token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      bootstrapping,
      pendingPhone,
      pendingCountryIso,
      pendingOtpRequestedAt,
      devOtpHint,
      setPendingPhone,
      setPendingCountryIso,
      setPendingOtpRequestedAt,
      setDevOtpHint,
      resetPendingAuth,
      completeAuth,
      logout,
    }),
    [
      bootstrapping,
      completeAuth,
      devOtpHint,
      logout,
      pendingCountryIso,
      pendingOtpRequestedAt,
      pendingPhone,
      resetPendingAuth,
      token,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
