import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { appConfig } from './app-config';
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
  if (expoHost) return `http://${expoHost}:${appConfig.api.defaultPort}`;

  if (Platform.OS === 'android') {
    return `http://${appConfig.api.androidEmulatorHost}:${appConfig.api.defaultPort}`;
  }

  return `http://${appConfig.api.localhost}:${appConfig.api.defaultPort}`;
};
