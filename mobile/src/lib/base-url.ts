import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { env } from './env';

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const parseExpoHost = (): string | null => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return host || null;
};

export const resolveApiBaseUrl = () => {
  const fromEnv = env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return trimTrailingSlash(fromEnv);

  const expoHost = parseExpoHost();
  if (expoHost) return `http://${expoHost}:3000`;

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
};
