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

export type SessionEndReason = 'expired';

type LogoutOptions = {
  reason?: SessionEndReason;
  allDevices?: boolean;
};

type AuthContextValue = {
  token: string | null;
  bootstrapping: boolean;
  pendingPhone: string;
  pendingCountryIso: AuthCountryIso;
  pendingOtpRequestedAt: number | null;
  devOtpHint: string;
  sessionEndReason: SessionEndReason | null;
  setPendingPhone: (phone: string) => void;
  setPendingCountryIso: (countryIso: AuthCountryIso) => void;
  setPendingOtpRequestedAt: (value: number | null) => void;
  setDevOtpHint: (otp: string) => void;
  resetPendingAuth: () => void;
  clearSessionEndReason: () => void;
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
  const [sessionEndReason, setSessionEndReason] =
    useState<SessionEndReason | null>(null);

  const clearLocalSession = useCallback(async (options?: LogoutOptions) => {
    setToken(null);
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
    if (options?.reason === 'expired') {
      setSessionEndReason('expired');
    }
    await tokenStore.clearToken();
    await clearSessionQueryCache();
  }, []);

  const logout = useCallback(
    async (options?: LogoutOptions) => {
      const refreshToken = await tokenStore.getRefreshToken();
      try {
        await logoutSession({
          refreshToken,
          allDevices: options?.allDevices,
        });
      } catch {
        // Best-effort server revoke; local clear still proceeds.
      }
      await clearLocalSession(options);
    },
    [clearLocalSession],
  );

  const clearSessionEndReason = useCallback(() => {
    setSessionEndReason(null);
  }, []);

  const resetPendingAuth = useCallback(() => {
    setPendingPhone('');
    setPendingOtpRequestedAt(null);
    setDevOtpHint('');
  }, []);

  const completeAuth = useCallback(
    async (session: AuthSessionTokens) => {
      await clearSessionQueryCache();
      // Persist before exposing token in React state. The API client reads from
      // SecureStore; updating state first lets the auth gate mount dashboard
      // and fire authenticated requests while the store is still empty → 401 →
      // silent logout (seen on native iOS after dual-token writes).
      await tokenStore.setSession(session);
      setSessionEndReason(null);
      resetPendingAuth();
      setToken(session.token);
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
        await logout(options ?? { reason: 'expired' });
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
      sessionEndReason,
      setPendingPhone,
      setPendingCountryIso,
      setPendingOtpRequestedAt,
      setDevOtpHint,
      resetPendingAuth,
      clearSessionEndReason,
      completeAuth,
      logout,
    }),
    [
      bootstrapping,
      clearSessionEndReason,
      completeAuth,
      devOtpHint,
      logout,
      pendingCountryIso,
      pendingOtpRequestedAt,
      pendingPhone,
      resetPendingAuth,
      sessionEndReason,
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
