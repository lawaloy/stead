import React from 'react';
import { Link, Stack, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../src/lib/auth-state';

const LogoutButton = () => {
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <Pressable
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
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 8,
      backgroundColor: '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: '#e5eaf4',
    }}
  >
    <Link href="/(app)/dashboard">Dashboard</Link>
    <Link href="/(app)/goal">Goal</Link>
    <Link href="/(app)/add-transaction">Transaction</Link>
  </View>
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
