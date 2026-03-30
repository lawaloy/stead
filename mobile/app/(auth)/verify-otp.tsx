import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { ApiError, verifyOtp } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { ScreenShell } from '../../src/components/screen-shell';
import { getAuthCountry } from '../../src/lib/countries';

export default function VerifyOtpScreen() {
  const [otp, setOtp] = useState('');
  const router = useRouter();
  const {
    pendingPhone,
    pendingCountryIso,
    devOtpHint,
    completeAuth,
    setDevOtpHint,
  } = useAuth();
  const country = getAuthCountry(pendingCountryIso);

  useEffect(() => {
    if (devOtpHint) setOtp(devOtpHint);
  }, [devOtpHint]);

  const validation = useMemo(() => {
    if (!otp) return '';
    if (!/^\d{6}$/.test(otp)) return 'OTP must be 6 digits';
    return '';
  }, [otp]);

  const mutation = useMutation({
    mutationFn: async () => verifyOtp(pendingPhone, pendingCountryIso, otp),
    retry: false,
    onSuccess: async (data) => {
      await completeAuth(data.token);
      setDevOtpHint('');
      router.replace('/(app)/dashboard');
    },
  });

  if (!pendingPhone) {
    return (
      <ScreenShell title="Verify OTP">
        <Text style={styles.error}>No phone found. Start from Request OTP.</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/(auth)/request-otp')}>
          <Text style={styles.buttonText}>Go to Request OTP</Text>
        </Pressable>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Verify OTP">
      <Text style={styles.label}>
        Code sent to {country.label} number {pendingPhone}
      </Text>
      {devOtpHint ? <Text style={styles.hint}>Dev OTP: {devOtpHint}</Text> : null}
      <TextInput
        value={otp}
        onChangeText={setOtp}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
      />
      {validation ? <Text style={styles.error}>{validation}</Text> : null}
      {mutation.error ? (
        <Text style={styles.error}>{(mutation.error as ApiError).message}</Text>
      ) : null}
      <Pressable
        style={[styles.button, (!!validation || mutation.isPending) && styles.buttonDisabled]}
        disabled={!!validation || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        <Text style={styles.buttonText}>
          {mutation.isPending ? 'Verifying...' : 'Verify OTP'}
        </Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', color: '#25324a' },
  hint: { color: '#0f6fff', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  button: {
    backgroundColor: '#0f6fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#c02020' },
});
