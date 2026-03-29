import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestOtp, ApiError } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { ScreenShell } from '../../src/components/screen-shell';
import {
  authCountries,
  AuthCountryIso,
  defaultAuthCountryIso,
  getAuthCountry,
} from '../../src/lib/countries';
import { isValidPhoneForCountry } from '../../src/lib/phone';

export default function RequestOtpScreen() {
  const [phone, setPhone] = useState('');
  const [countryIso, setCountryIso] =
    useState<AuthCountryIso>(defaultAuthCountryIso);
  const router = useRouter();
  const { setPendingPhone, setPendingCountryIso, setDevOtpHint } = useAuth();
  const selectedCountry = getAuthCountry(countryIso);

  const validation = useMemo(() => {
    if (!phone) return '';
    if (!isValidPhoneForCountry(phone, countryIso))
      return 'Enter a valid phone number for the selected country';
    return '';
  }, [countryIso, phone]);

  const mutation = useMutation({
    mutationFn: async () => requestOtp(phone, countryIso),
    onSuccess: (data) => {
      setPendingPhone(phone);
      setPendingCountryIso(countryIso);
      setDevOtpHint(data.otp || '');
      router.push('/(auth)/verify-otp');
    },
  });

  return (
    <ScreenShell title="Stead Login">
      <Text style={styles.label}>Country</Text>
      <View style={styles.countryRow}>
        {authCountries.map((country) => {
          const active = country.iso === countryIso;
          return (
            <Pressable
              key={country.iso}
              style={[styles.countryChip, active && styles.countryChipActive]}
              onPress={() => setCountryIso(country.iso)}
            >
              <Text
                style={[
                  styles.countryChipText,
                  active && styles.countryChipTextActive,
                ]}
              >
                {country.iso} {country.dialCode}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder={selectedCountry.placeholder}
        keyboardType="phone-pad"
        autoCapitalize="none"
        style={styles.input}
      />
      <Text style={styles.helper}>
        {selectedCountry.label}: local number or full international number
      </Text>
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
          {mutation.isPending ? 'Requesting...' : 'Request OTP'}
        </Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', color: '#25324a' },
  helper: { color: '#60708a' },
  countryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryChip: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  countryChipActive: {
    borderColor: '#0f6fff',
    backgroundColor: '#e9f1ff',
  },
  countryChipText: { color: '#25324a', fontWeight: '600' },
  countryChipTextActive: { color: '#0f4fcc' },
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
