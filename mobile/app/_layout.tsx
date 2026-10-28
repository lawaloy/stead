import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/query-client';
import { AuthProvider, useAuth } from '../src/lib/auth-state';
import * as Sentry from '@sentry/react-native';
import { initializeObservability } from '../src/lib/observability';

const observabilityEnabled = initializeObservability();

const Gate = () => {
  const { bootstrapping, token } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) router.replace('/(auth)/request-otp');
    if (token && inAuthGroup) router.replace('/(app)/dashboard');
  }, [bootstrapping, router, segments, token]);

  if (bootstrapping) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f6f8fb',
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
};

function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default observabilityEnabled ? Sentry.wrap(RootLayout) : RootLayout;
