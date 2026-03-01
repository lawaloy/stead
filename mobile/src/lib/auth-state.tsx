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

type AuthContextValue = {
  token: string | null;
  bootstrapping: boolean;
  pendingPhone: string;
  devOtpHint: string;
  setPendingPhone: (phone: string) => void;
  setDevOtpHint: (otp: string) => void;
  completeAuth: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [pendingPhone, setPendingPhone] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');

  const logout = useCallback(async () => {
    setToken(null);
    await tokenStore.clearToken();
  }, []);

  const completeAuth = useCallback(async (jwt: string) => {
    setToken(jwt);
    setDevOtpHint('');
    await tokenStore.setToken(jwt);
  }, []);

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
      devOtpHint,
      setPendingPhone,
      setDevOtpHint,
      completeAuth,
      logout,
    }),
    [bootstrapping, completeAuth, devOtpHint, logout, pendingPhone, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
