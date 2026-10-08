import React from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/query-client';
import { AuthProvider, useAuth } from '../src/lib/auth-state';

// Auth routing is declarative: the session token decides which screens exist
// in the root stack, and expo-router/React Navigation derive the stack state
// from that. Do not add imperative `router.replace` auth redirects here or in
// screens. On iOS 26 + Fabric (react-native-screens 4.26), a screen that React
// unmounts while UIKit is still running a transition (for example the `/`
// index screen redirecting away before its first appearance finished, or two
// redirects racing after login/logout) can leave its empty native view on top
// of the next screen. That view swallows every touch: taps reach the window but
// never reach JS (seen as `auth-request-otp` doing nothing in native-ios CI).
const Gate = () => {
  const { bootstrapping, token } = useAuth();
  const signedIn = Boolean(token);

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)/request-otp" />
        <Stack.Screen name="(auth)/verify-otp" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* `/` is only a URL entry point. Never mount it as a screen: the stack
          starts on the first allowed screen above instead of mounting index
          and immediately replacing it during the navigator's first appearance. */}
      <Stack.Protected guard={false}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
};

export default function RootLayout() {
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
