import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenShell } from '../../src/components/screen-shell';
import {
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../../src/lib/api';
import { appConfig } from '../../src/lib/app-config';
import { useAuth } from '../../src/lib/auth-state';
import { queryClient } from '../../src/lib/query-client';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';

const Toggle = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked: value }}
    accessibilityLabel={label}
    onPress={() => onChange(!value)}
    style={[styles.toggle, value && styles.toggleEnabled]}
  >
    <View style={styles.copy}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.help}>{description}</Text>
    </View>
    <Text style={styles.toggleValue}>{value ? 'On' : 'Off'}</Text>
  </Pressable>
);

export default function AccountScreen() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const queryKey = sessionQueryKeys.account(token);
  const query = useQuery({
    queryKey,
    queryFn: getAccount,
    enabled: Boolean(token),
    retry: 1,
  });
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(
    null,
  );
  const [productResearchEnabled, setProductResearchEnabled] = useState<
    boolean | null
  >(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [message, setMessage] = useState('');

  const profileMutation = useMutation({
    mutationFn: () => {
      const value = displayName ?? query.data?.profile.displayName ?? '';
      return updateAccountProfile({ displayName: value.trim() || null });
    },
    onSuccess: (account) => {
      queryClient.setQueryData(queryKey, account);
      setDisplayName(null);
      setMessage('Profile saved');
    },
  });
  const consentMutation = useMutation({
    mutationFn: () =>
      updateAccountConsents({
        analyticsEnabled:
          analyticsEnabled ?? query.data?.consents.analyticsEnabled ?? false,
        productResearchEnabled:
          productResearchEnabled ??
          query.data?.consents.productResearchEnabled ??
          false,
      }),
    onSuccess: (account) => {
      queryClient.setQueryData(queryKey, account);
      setAnalyticsEnabled(null);
      setProductResearchEnabled(null);
      setMessage('Consent choices saved');
    },
  });
  const exportMutation = useMutation({
    mutationFn: exportAccountData,
    onSuccess: async (data) => {
      await Share.share({
        title: 'Stead data export',
        message: JSON.stringify(data, null, 2),
      });
      setMessage('Data export prepared');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      await logout();
      router.replace('/(auth)/request-otp');
    },
  });

  if (query.isLoading) {
    return (
      <ScreenShell title="Account and privacy">
        <Text>Loading your account...</Text>
      </ScreenShell>
    );
  }
  if (!query.data || query.error) {
    return (
      <ScreenShell title="Account and privacy">
        <Text accessibilityRole="alert" style={styles.error}>
          Could not load your account.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => query.refetch()}>
          <Text style={styles.action}>Retry</Text>
        </Pressable>
      </ScreenShell>
    );
  }

  const account = query.data;
  const currentName = displayName ?? account.profile.displayName ?? '';
  const analytics =
    analyticsEnabled ?? account.consents.analyticsEnabled ?? false;
  const research =
    productResearchEnabled ?? account.consents.productResearchEnabled ?? false;
  const busy =
    profileMutation.isPending ||
    consentMutation.isPending ||
    exportMutation.isPending ||
    deleteMutation.isPending;

  const confirmDeletion = () => {
    Alert.alert(
      'Permanently delete account?',
      'This removes your goals, transactions, preferences, consent history, and account access. This cannot be undone.',
      [
        { text: 'Keep account', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  return (
    <ScreenShell title="Account and privacy">
      <View style={styles.card}>
        <Text style={styles.label}>Phone number</Text>
        <Text selectable>{account.profile.phone}</Text>
        <Text style={styles.help}>
          Your sign-in number cannot be changed yet.
        </Text>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          maxLength={100}
          value={currentName}
          onChangeText={(value) => {
            setDisplayName(value);
            setMessage('');
          }}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => profileMutation.mutate()}
          style={[styles.primary, busy && styles.disabled]}
        >
          <Text style={styles.primaryText}>Save profile</Text>
        </Pressable>
      </View>

      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Optional consent
      </Text>
      <Text style={styles.help}>
        Core account processing is covered by the privacy notice. These optional
        choices are off by default and can be withdrawn at any time.
      </Text>
      <Toggle
        label="Product analytics"
        description="Allow de-identified usage measurements to improve Stead."
        value={analytics}
        onChange={(value) => setAnalyticsEnabled(value)}
      />
      <Toggle
        label="Product research"
        description="Allow Stead to contact you for voluntary product research."
        value={research}
        onChange={(value) => setProductResearchEnabled(value)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => consentMutation.mutate()}
        style={[styles.primary, busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>Save consent choices</Text>
      </Pressable>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Your data
        </Text>
        <Text style={styles.help}>
          Prepare a portable JSON copy of your profile, current consent choices
          and history, goals, transactions, alert settings, and account
          activity.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => exportMutation.mutate()}
        >
          <Text style={styles.action}>Export and share my data</Text>
        </Pressable>
        {appConfig.support.email ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Email Stead support"
            onPress={() =>
              Linking.openURL(
                `mailto:${appConfig.support.email}?subject=Stead%20support`,
              )
            }
          >
            <Text style={styles.action}>Contact support</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dangerCard}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Delete account
        </Text>
        <Text style={styles.help}>
          Export anything you need first. Enter DELETE to enable permanent
          deletion.
        </Text>
        <TextInput
          accessibilityLabel="Delete account confirmation"
          autoCapitalize="characters"
          value={deleteConfirmation}
          onChangeText={setDeleteConfirmation}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete account permanently"
          accessibilityState={{
            disabled: deleteConfirmation !== 'DELETE' || busy,
          }}
          disabled={deleteConfirmation !== 'DELETE' || busy}
          onPress={confirmDeletion}
          style={[
            styles.danger,
            (deleteConfirmation !== 'DELETE' || busy) && styles.disabled,
          ]}
        >
          <Text style={styles.primaryText}>Delete account permanently</Text>
        </Pressable>
      </View>

      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      {profileMutation.error ||
      consentMutation.error ||
      exportMutation.error ||
      deleteMutation.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          The account action failed. Check your connection and retry.
        </Text>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10 },
  dangerCard: {
    backgroundColor: '#fff5f5',
    borderColor: '#e6b8b8',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { color: '#0f1c2f', fontSize: 18, fontWeight: '800' },
  label: { color: '#0f1c2f', fontWeight: '700' },
  help: { color: '#66738a', lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: '#b9c5d8',
    borderRadius: 8,
    padding: 10,
  },
  toggle: {
    backgroundColor: '#fff',
    borderColor: '#dbe3f2',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleEnabled: { borderColor: '#1769aa', backgroundColor: '#eef6ff' },
  copy: { flex: 1, gap: 3 },
  toggleValue: { color: '#1769aa', fontWeight: '800' },
  primary: { backgroundColor: '#1769aa', borderRadius: 10, padding: 13 },
  danger: { backgroundColor: '#b42318', borderRadius: 10, padding: 13 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
  action: { color: '#1769aa', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#c02020' },
});
