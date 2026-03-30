import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestOtp, verifyOtp } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { ScreenShell } from '../../src/components/screen-shell';
import { getAuthCountry } from '../../src/lib/countries';
import {
  formatCooldownLabel,
  getAuthErrorMessage,
  OTP_RESEND_COOLDOWN_MS,
} from '../../src/lib/auth-feedback';

export default function VerifyOtpScreen() {
  const [otp, setOtp] = useState('');
  const [now, setNow] = useState(Date.now());
  const router = useRouter();
  const {
    pendingPhone,
    pendingCountryIso,
    pendingOtpRequestedAt,
    devOtpHint,
    completeAuth,
    resetPendingAuth,
    setPendingOtpRequestedAt,
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

  useEffect(() => {
    if (!pendingOtpRequestedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [pendingOtpRequestedAt]);

  const resendCooldownMs = pendingOtpRequestedAt
    ? Math.max(0, pendingOtpRequestedAt + OTP_RESEND_COOLDOWN_MS - now)
    : 0;
  const canResend = resendCooldownMs === 0;

  const mutation = useMutation({
    mutationFn: async () => verifyOtp(pendingPhone, pendingCountryIso, otp),
    retry: false,
    onSuccess: async (data) => {
      await completeAuth(data.token);
      setDevOtpHint('');
      router.replace('/(app)/dashboard');
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => requestOtp(pendingPhone, pendingCountryIso),
    retry: false,
    onSuccess: (data) => {
      setPendingOtpRequestedAt(Date.now());
      setDevOtpHint(data.otp || '');
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
      <Text style={styles.label}>Code sent to your {country.label} number</Text>
      <Text style={styles.phone}>{pendingPhone}</Text>
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
        <Text style={styles.error}>
          {getAuthErrorMessage(mutation.error, 'verify')}
        </Text>
      ) : null}
      {resendMutation.error ? (
        <Text style={styles.error}>
          {getAuthErrorMessage(resendMutation.error, 'resend')}
        </Text>
      ) : null}
      {resendMutation.isSuccess ? (
        <Text style={styles.success}>A fresh code is on the way.</Text>
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
      <View style={styles.secondaryActions}>
        <Pressable
          style={[
            styles.secondaryButton,
            (!canResend || resendMutation.isPending || mutation.isPending) &&
              styles.secondaryButtonDisabled,
          ]}
          disabled={!canResend || resendMutation.isPending || mutation.isPending}
          onPress={() => resendMutation.mutate()}
        >
          <Text style={styles.secondaryButtonText}>
            {resendMutation.isPending
              ? 'Sending another code...'
              : canResend
                ? 'Resend code'
                : `Resend in ${formatCooldownLabel(resendCooldownMs)}`}
          </Text>
        </Pressable>
        {!canResend ? (
          <Text style={styles.helper}>
            Wait for the countdown before asking for another code.
          </Text>
        ) : null}
        <Pressable
          style={styles.linkButton}
          onPress={() => {
            resetPendingAuth();
            router.replace('/(auth)/request-otp');
          }}
        >
          <Text style={styles.linkText}>Use a different phone number</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', color: '#25324a' },
  phone: { color: '#0f1c2f', fontWeight: '700', fontSize: 18 },
  hint: { color: '#0f6fff', fontWeight: '700' },
  helper: { color: '#60708a' },
  success: { color: '#0e7a38', fontWeight: '600' },
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
  secondaryActions: { gap: 10 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0f6fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  secondaryButtonDisabled: { opacity: 0.6 },
  secondaryButtonText: { color: '#0f4fcc', fontWeight: '700' },
  linkButton: { alignItems: 'center', paddingVertical: 4 },
  linkText: { color: '#0f4fcc', fontWeight: '600' },
  error: { color: '#c02020' },
});
