import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tokenStore, type AuthSessionTokens } from './token-store';
import { configureApiAuth, logoutSession } from './api';
import { AuthCountryIso, defaultAuthCountryIso } from './countries';
import { clearSessionQueryCache } from './session-query-cache';

type LogoutOptions = {
  reason?: 'expired';
};

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
  completeAuth: (session: AuthSessionTokens) => Promise<void>;
  logout: (options?: LogoutOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingCountryIso, setPendingCountryIso] = useState<AuthCountryIso>(
    defaultAuthCountryIso,
  );
  const [pendingOtpRequestedAt, setPendingOtpRequestedAt] = useState<
    number | null
  >(null);
  const [devOtpHint, setDevOtpHint] = useState('');

  const clearLocalSession = useCallback(async () => {
    setToken(null);
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
    await tokenStore.clearToken();
    await clearSessionQueryCache();
  }, []);

  const logout = useCallback(
    async (_options?: LogoutOptions) => {
      const refreshToken = await tokenStore.getRefreshToken();
      try {
        await logoutSession(refreshToken);
      } catch {
        // Best-effort server revoke; local clear still proceeds.
      }
      await clearLocalSession();
    },
    [clearLocalSession],
  );

  const resetPendingAuth = useCallback(() => {
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
  }, []);

  const completeAuth = useCallback(
    async (session: AuthSessionTokens) => {
      await clearSessionQueryCache();
      setToken(session.token);
      resetPendingAuth();
      await tokenStore.setSession(session);
    },
    [resetPendingAuth],
  );

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
      getToken: () => tokenStore.getToken(),
      getRefreshToken: () => tokenStore.getRefreshToken(),
      persistSession: async (session) => {
        await tokenStore.setSession(session);
        setToken(session.token);
      },
      onUnauthorized: async (options) => {
        await logout(options);
      },
    });
  }, [logout]);

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
