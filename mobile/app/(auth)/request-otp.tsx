import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchAuthCountries, requestOtp } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { ScreenShell } from '../../src/components/screen-shell';
import {
  AuthCountryIso,
  defaultAuthCountryIso,
  fallbackAuthCountries,
  getAuthCountry,
  getDefaultAuthCountry,
  withDisplayPhoneExamples,
} from '../../src/lib/countries';
import {
  formatPhoneForDisplay,
  normalizePhoneForCountry,
} from '../../src/lib/phone';
import { getAuthErrorMessage } from '../../src/lib/auth-feedback';

export default function RequestOtpScreen() {
  const [phone, setPhone] = useState('');
  const [countryIso, setCountryIso] =
    useState<AuthCountryIso>(defaultAuthCountryIso);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const router = useRouter();
  const {
    setPendingPhone,
    setPendingCountryIso,
    setPendingOtpRequestedAt,
    setDevOtpHint,
  } = useAuth();
  const countriesQuery = useQuery({
    queryKey: ['auth-countries'],
    queryFn: fetchAuthCountries,
    retry: 1,
  });
  const countries = withDisplayPhoneExamples(
    countriesQuery.data?.countries.length
      ? countriesQuery.data.countries
      : fallbackAuthCountries,
  );
  const effectiveCountryIso = countries.some((country) => country.iso === countryIso)
    ? countryIso
    : getDefaultAuthCountry(countries).iso;
  const selectedCountry = getAuthCountry(effectiveCountryIso, countries);
  const normalizedPhone = normalizePhoneForCountry(phone, effectiveCountryIso);

  const validation =
    phone && !normalizedPhone
      ? 'Enter a valid phone number for the selected country'
      : '';
  const requestInput =
    normalizedPhone === null
      ? null
      : { phone: normalizedPhone, countryIso: effectiveCountryIso };

  const mutation = useMutation({
    mutationFn: async (input: { phone: string; countryIso: AuthCountryIso }) =>
      requestOtp(input.phone, input.countryIso),
    onSuccess: (data, input) => {
      setPendingPhone(input.phone);
      setPendingCountryIso(input.countryIso);
      setPendingOtpRequestedAt(Date.now());
      setDevOtpHint(data.otp || '');
      router.push('/(auth)/verify-otp');
    },
  });

  return (
    <ScreenShell title="Stead Login">
      <Text style={styles.label}>Country</Text>
      <View style={styles.countrySelect}>
        <Pressable
          style={styles.countrySelectButton}
          disabled={mutation.isPending}
          onPress={() => setCountryMenuOpen((open) => !open)}
        >
          <Text style={styles.countrySelectText}>
            {selectedCountry.label} ({selectedCountry.dialCode})
          </Text>
          <Text style={styles.countrySelectIcon}>
            {countryMenuOpen ? '^' : 'v'}
          </Text>
        </Pressable>
        {countryMenuOpen ? (
          <View style={styles.countryMenu}>
            {countries.map((country) => (
              <Pressable
                key={country.iso}
                style={[
                  styles.countryOption,
                  country.iso === effectiveCountryIso &&
                    styles.countryOptionActive,
                ]}
                disabled={mutation.isPending}
                onPress={() => {
                  setCountryIso(country.iso);
                  setCountryMenuOpen(false);
                }}
              >
                <Text style={styles.countryOptionText}>
                  {country.label} {country.dialCode}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        value={phone}
        onChangeText={(value) =>
          setPhone(formatPhoneForDisplay(value, effectiveCountryIso))
        }
        placeholder={selectedCountry.phoneExample}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoCapitalize="none"
        editable={!mutation.isPending}
        style={styles.input}
      />
      <Text style={styles.helper}>
        {selectedCountry.label}: local number or full international number
      </Text>
      {validation ? <Text style={styles.error}>{validation}</Text> : null}
      {mutation.error ? (
        <Text style={styles.error}>
          {getAuthErrorMessage(mutation.error, 'request')}
        </Text>
      ) : null}
      <Pressable
        style={[
          styles.button,
          (!requestInput || mutation.isPending) && styles.buttonDisabled,
        ]}
        disabled={!requestInput || mutation.isPending}
        onPress={() => {
          if (!requestInput) return;
          mutation.mutate(requestInput);
        }}
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
  countrySelect: {
    position: 'relative',
    zIndex: 2,
  },
  countrySelectButton: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countrySelectText: { color: '#25324a', fontWeight: '600' },
  countrySelectIcon: { color: '#60708a', fontSize: 12 },
  countryMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  countryOption: { paddingHorizontal: 12, paddingVertical: 11 },
  countryOptionActive: { backgroundColor: '#e9f1ff' },
  countryOptionText: { color: '#25324a', fontWeight: '600' },
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
