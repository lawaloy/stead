import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, createTransaction, getActiveGoal } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { queryClient } from '../../src/lib/query-client';
import {
  dateInputToIso,
  nairaInputToKobo,
  todayDateInput,
} from '../../src/lib/transactions';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';
import { ScreenShell } from '../../src/components/screen-shell';

export default function AddTransactionScreen() {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amountNaira, setAmountNaira] = useState('5000');
  const [occurredOn, setOccurredOn] = useState(() => todayDateInput());
  const [note, setNote] = useState('manual entry');
  const [tagGoal, setTagGoal] = useState(true);
  const [success, setSuccess] = useState('');

  const { token } = useAuth();
  const activeGoalQuery = useQuery({
    queryKey: sessionQueryKeys.activeGoal(token),
    queryFn: getActiveGoal,
    enabled: Boolean(token),
    retry: 1,
  });
  const goalLinkPending = tagGoal && activeGoalQuery.isPending;

  const validation = useMemo(() => {
    if (nairaInputToKobo(amountNaira) === null) {
      return 'Enter an amount greater than zero with at most two decimal places.';
    }
    if (dateInputToIso(occurredOn) === null) {
      return 'Enter a valid date in YYYY-MM-DD format.';
    }
    if (note.length > 280) return 'Note must be 280 characters or fewer.';
    if (tagGoal && !activeGoalQuery.data) {
      return activeGoalQuery.error
        ? 'Your active goal is unavailable. Reconnect or turn off goal linking.'
        : 'Create an active goal or turn off goal linking.';
    }
    return '';
  }, [
    activeGoalQuery.data,
    activeGoalQuery.error,
    amountNaira,
    note.length,
    occurredOn,
    tagGoal,
  ]);

  const mutation = useMutation({
    mutationFn: async () => {
      const amountKobo = nairaInputToKobo(amountNaira);
      const occurredAt = dateInputToIso(occurredOn);
      if (amountKobo === null || occurredAt === null) {
        throw new Error('Transaction form is invalid');
      }

      return createTransaction({
        direction,
        amountKobo,
        occurredAt,
        note: note || undefined,
        goalId: tagGoal ? activeGoalQuery.data?.id : undefined,
      });
    },
    onSuccess: async () => {
      setSuccess('Transaction added');
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKeys.dashboard(token),
      });
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKeys.activeGoal(token),
      });
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKeys.transactions(token),
      });
    },
  });

  return (
    <ScreenShell title="Add Transaction">
      <View style={styles.segment} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: direction === 'in' }}
          style={[
            styles.segmentBtn,
            direction === 'in' && styles.segmentActive,
          ]}
          onPress={() => setDirection('in')}
        >
          <Text style={styles.segmentText}>Income</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: direction === 'out' }}
          style={[
            styles.segmentBtn,
            direction === 'out' && styles.segmentActive,
          ]}
          onPress={() => setDirection('out')}
        >
          <Text style={styles.segmentText}>Expense</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Amount (naira)</Text>
      <TextInput
        accessibilityLabel="Transaction amount in naira"
        style={styles.input}
        value={amountNaira}
        keyboardType="decimal-pad"
        onChangeText={setAmountNaira}
      />

      <Text style={styles.label}>Date</Text>
      <TextInput
        accessibilityLabel="Transaction date"
        style={styles.input}
        value={occurredOn}
        placeholder="YYYY-MM-DD"
        onChangeText={setOccurredOn}
      />

      <Text style={styles.label}>Note</Text>
      <TextInput
        accessibilityLabel="Transaction note"
        style={styles.input}
        value={note}
        maxLength={280}
        onChangeText={setNote}
      />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: tagGoal }}
        onPress={() => setTagGoal((v) => !v)}
        style={styles.checkboxWrap}
      >
        <View style={[styles.checkbox, tagGoal && styles.checkboxOn]} />
        <Text>
          Tag active goal contribution (
          {activeGoalQuery.data ? activeGoalQuery.data.name : 'no active goal'})
        </Text>
      </Pressable>

      {goalLinkPending ? (
        <Text accessibilityLiveRegion="polite">Checking your active goal...</Text>
      ) : null}
      {validation ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {validation}
        </Text>
      ) : null}
      {mutation.error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {(mutation.error as ApiError).message}
        </Text>
      ) : null}
      {success ? (
        <Text
          style={styles.success}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {success}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            Boolean(validation) || goalLinkPending || mutation.isPending,
        }}
        style={[
          styles.button,
          (Boolean(validation) || goalLinkPending || mutation.isPending) &&
            styles.buttonDisabled,
        ]}
        disabled={Boolean(validation) || goalLinkPending || mutation.isPending}
        onPress={() => {
          setSuccess('');
          mutation.mutate();
        }}
      >
        <Text style={styles.buttonText}>
          {mutation.isPending ? 'Submitting...' : 'Add Transaction'}
        </Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e7eef9',
    borderRadius: 10,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: '#ffffff' },
  segmentText: { fontWeight: '700' },
  label: { fontWeight: '600', color: '#25324a' },
  input: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  checkboxWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#6a7690',
    borderRadius: 4,
  },
  checkboxOn: { backgroundColor: '#0f6fff', borderColor: '#0f6fff' },
  button: {
    backgroundColor: '#0f6fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#c02020' },
  success: { color: '#0a7d29', fontWeight: '700' },
});
