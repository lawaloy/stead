import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenShell } from '../../src/components/screen-shell';
import { getAlertPreferences, updateAlertPreferences } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { queryClient } from '../../src/lib/query-client';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';
import type { AlertPreferences } from '../../src/contracts/generated/types.gen';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    <View style={styles.toggleCopy}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.help}>{description}</Text>
    </View>
    <Text style={styles.toggleValue}>{value ? 'On' : 'Off'}</Text>
  </Pressable>
);

export default function AlertsScreen() {
  const { token } = useAuth();
  const queryKey = sessionQueryKeys.alertPreferences(token);
  const query = useQuery({
    queryKey,
    queryFn: getAlertPreferences,
    enabled: Boolean(token),
    retry: 1,
  });
  const [draft, setDraft] = useState<Partial<AlertPreferences>>({});
  const [saved, setSaved] = useState('');

  const weeklySummaryEnabled =
    draft.weeklySummaryEnabled ?? query.data?.weeklySummaryEnabled ?? false;
  const riskAlertsEnabled =
    draft.riskAlertsEnabled ?? query.data?.riskAlertsEnabled ?? false;
  const timeZone =
    draft.timeZone ??
    query.data?.timeZone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    'UTC';
  const weeklyDay = draft.weeklyDay ?? query.data?.weeklyDay ?? 1;
  const weeklyHourLocal = String(
    draft.weeklyHourLocal ?? query.data?.weeklyHourLocal ?? 9,
  );

  const hour = Number(weeklyHourLocal);
  const formValid =
    timeZone.trim().length > 0 &&
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23;
  const mutation = useMutation({
    mutationFn: () =>
      updateAlertPreferences({
        weeklySummaryEnabled,
        riskAlertsEnabled,
        timeZone: timeZone.trim(),
        weeklyDay,
        weeklyHourLocal: hour,
      }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
      setDraft({});
      setSaved('Preferences saved');
    },
  });

  if (query.isLoading) {
    return (
      <ScreenShell title="Notification preferences">
        <Text>Loading notification preferences...</Text>
      </ScreenShell>
    );
  }

  if (query.error) {
    return (
      <ScreenShell title="Notification preferences">
        <Text accessibilityRole="alert" style={styles.error}>
          Could not load notification preferences.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => query.refetch()}>
          <Text style={styles.action}>Retry</Text>
        </Pressable>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Notification preferences">
      <Text style={styles.intro}>
        Choose the SMS updates Stead may send. Both options are off until you
        enable them.
      </Text>
      <Toggle
        label="Weekly summary"
        description="A weekly snapshot of readiness, status, and required savings pace."
        value={weeklySummaryEnabled}
        onChange={(value) => {
          setSaved('');
          setDraft((current) => ({
            ...current,
            weeklySummaryEnabled: value,
          }));
        }}
      />
      <Toggle
        label="Risk and recovery alerts"
        description="Material deterioration alerts with a 24-hour cooldown, plus recovery to stable."
        value={riskAlertsEnabled}
        onChange={(value) => {
          setSaved('');
          setDraft((current) => ({ ...current, riskAlertsEnabled: value }));
        }}
      />
      <View style={styles.card}>
        <Text style={styles.label}>Weekly delivery day</Text>
        <View style={styles.days}>
          {days.map((day, index) => (
            <Pressable
              key={day}
              accessibilityRole="radio"
              accessibilityState={{ selected: weeklyDay === index }}
              accessibilityLabel={day}
              onPress={() =>
                setDraft((current) => ({ ...current, weeklyDay: index }))
              }
              style={[styles.day, weeklyDay === index && styles.daySelected]}
            >
              <Text>{day}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Local delivery hour (0–23)</Text>
        <TextInput
          accessibilityLabel="Weekly delivery hour"
          keyboardType="number-pad"
          value={weeklyHourLocal}
          onChangeText={(value) =>
            setDraft((current) => ({
              ...current,
              weeklyHourLocal: Number(value),
            }))
          }
          style={styles.input}
        />
        <Text style={styles.label}>Time zone</Text>
        <TextInput
          accessibilityLabel="IANA time zone"
          autoCapitalize="none"
          value={timeZone}
          onChangeText={(value) =>
            setDraft((current) => ({ ...current, timeZone: value }))
          }
          style={styles.input}
        />
        <Text style={styles.help}>For example: Africa/Lagos</Text>
      </View>
      {!formValid ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Enter a valid time zone and an hour from 0 to 23.
        </Text>
      ) : null}
      {mutation.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Could not save preferences. Check the time zone and retry.
        </Text>
      ) : null}
      {saved ? <Text accessibilityRole="alert">{saved}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !formValid || mutation.isPending }}
        disabled={!formValid || mutation.isPending}
        onPress={() => mutation.mutate()}
        style={[
          styles.save,
          (!formValid || mutation.isPending) && styles.disabled,
        ]}
      >
        <Text style={styles.saveText}>
          {mutation.isPending ? 'Saving...' : 'Save preferences'}
        </Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { color: '#526079', lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10 },
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
  toggleCopy: { flex: 1, gap: 3 },
  toggleValue: { color: '#1769aa', fontWeight: '800' },
  label: { fontWeight: '700', color: '#0f1c2f' },
  help: { color: '#66738a', fontSize: 13 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { borderWidth: 1, borderColor: '#cbd5e5', borderRadius: 8, padding: 8 },
  daySelected: { borderColor: '#1769aa', backgroundColor: '#dceeff' },
  input: {
    borderWidth: 1,
    borderColor: '#b9c5d8',
    borderRadius: 8,
    padding: 10,
  },
  action: { color: '#1769aa', fontWeight: '700' },
  error: { color: '#c02020' },
  save: { backgroundColor: '#1769aa', borderRadius: 10, padding: 13 },
  disabled: { opacity: 0.5 },
  saveText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
});
