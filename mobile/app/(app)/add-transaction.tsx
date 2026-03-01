import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, createTransaction, getActiveGoal } from '../../src/lib/api';
import { queryClient } from '../../src/lib/query-client';
import { ScreenShell } from '../../src/components/screen-shell';

export default function AddTransactionScreen() {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amountKobo, setAmountKobo] = useState('500000');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString());
  const [note, setNote] = useState('manual entry');
  const [tagGoal, setTagGoal] = useState(true);
  const [success, setSuccess] = useState('');

  const activeGoalQuery = useQuery({
    queryKey: ['goal', 'active'],
    queryFn: getActiveGoal,
    retry: 1,
  });

  const validation = useMemo(() => {
    if (!/^\d+$/.test(amountKobo) || Number(amountKobo) <= 0) return 'amountKobo must be > 0';
    if (Number.isNaN(Date.parse(occurredAt))) return 'occurredAt must be a valid ISO date';
    return '';
  }, [amountKobo, occurredAt]);

  const mutation = useMutation({
    mutationFn: async () =>
      createTransaction({
        direction,
        amountKobo: Number(amountKobo),
        occurredAt,
        note: note || undefined,
        goalId: tagGoal ? activeGoalQuery.data?.id : undefined,
      }),
    onSuccess: async () => {
      setSuccess('Transaction added');
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stability'] });
      await queryClient.invalidateQueries({ queryKey: ['goal', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  return (
    <ScreenShell title="Add Transaction">
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, direction === 'in' && styles.segmentActive]}
          onPress={() => setDirection('in')}
        >
          <Text style={styles.segmentText}>Income</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, direction === 'out' && styles.segmentActive]}
          onPress={() => setDirection('out')}
        >
          <Text style={styles.segmentText}>Expense</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Amount (kobo)</Text>
      <TextInput
        style={styles.input}
        value={amountKobo}
        keyboardType="number-pad"
        onChangeText={setAmountKobo}
      />

      <Text style={styles.label}>Occurred At (ISO)</Text>
      <TextInput style={styles.input} value={occurredAt} onChangeText={setOccurredAt} />

      <Text style={styles.label}>Note</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} />

      <Pressable onPress={() => setTagGoal((v) => !v)} style={styles.checkboxWrap}>
        <View style={[styles.checkbox, tagGoal && styles.checkboxOn]} />
        <Text>
          Tag active goal contribution ({activeGoalQuery.data ? activeGoalQuery.data.name : 'no active goal'})
        </Text>
      </Pressable>

      {validation ? <Text style={styles.error}>{validation}</Text> : null}
      {mutation.error ? (
        <Text style={styles.error}>{(mutation.error as ApiError).message}</Text>
      ) : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <Pressable
        style={[styles.button, (!!validation || mutation.isPending) && styles.buttonDisabled]}
        disabled={!!validation || mutation.isPending}
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
  segment: { flexDirection: 'row', backgroundColor: '#e7eef9', borderRadius: 10, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
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
  checkbox: { width: 16, height: 16, borderWidth: 1, borderColor: '#6a7690', borderRadius: 4 },
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
