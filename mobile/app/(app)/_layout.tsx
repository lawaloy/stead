import React from 'react';
import { Link, Stack, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth-state';

const LogoutButton = () => {
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <Pressable
      testID="app-logout"
      onPress={async () => {
        await logout();
        router.replace('/(auth)/request-otp');
      }}
      style={{ marginRight: 12 }}
    >
      <Text style={{ color: '#c02020', fontWeight: '700' }}>Logout</Text>
    </Pressable>
  );
};

const TopNav = () => (
  <SafeAreaView edges={['top']} style={{ backgroundColor: '#ffffff' }}>
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e5eaf4',
      }}
    >
      <Link href="/(app)/dashboard" testID="nav-dashboard">
        Dashboard
      </Link>
      <Link href="/(app)/goal" testID="nav-goal">
        Goal
      </Link>
      <Link href="/(app)/transactions" testID="nav-activity">
        Activity
      </Link>
      <Link href="/(app)/alerts">Alerts</Link>
      <Link href="/(app)/account">Account</Link>
    </View>
  </SafeAreaView>
);

export default function AppLayout() {
  return (
    <>
      <TopNav />
      <Stack
        screenOptions={{
          headerRight: () => <LogoutButton />,
        }}
      />
    </>
  );
}
