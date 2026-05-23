import React, { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, createGoal, getActiveGoal } from '../../src/lib/api';
import { queryClient } from '../../src/lib/query-client';
import { ScreenShell } from '../../src/components/screen-shell';

const toNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

export default function GoalScreen() {
  const [name, setName] = useState('Rent');
  const [amountKobo, setAmountKobo] = useState('120000000');
  const [dueDate, setDueDate] = useState('');
  const [monthlyIncomeKobo, setMonthlyIncomeKobo] = useState('30000000');
  const [success, setSuccess] = useState('');

  const activeGoalQuery = useQuery({
    queryKey: ['goal', 'active'],
    queryFn: getActiveGoal,
    retry: 1,
  });

  const validation = useMemo(() => {
    if (!name.trim()) return 'Goal name is required';
    if (!/^\d+$/.test(amountKobo) || Number(amountKobo) <= 0) return 'amountTotalKobo must be > 0';
    if (Number.isNaN(Date.parse(dueDate))) return 'dueDate must be a valid ISO date';
    if (monthlyIncomeKobo && (!/^\d+$/.test(monthlyIncomeKobo) || Number(monthlyIncomeKobo) < 0)) {
      return 'monthlyIncomeKobo must be >= 0';
    }
    return '';
  }, [amountKobo, dueDate, monthlyIncomeKobo, name]);

  const mutation = useMutation({
    mutationFn: async () =>
      createGoal({
        name: name.trim(),
        amountTotalKobo: Number(amountKobo),
        dueDate,
        monthlyIncomeKobo: monthlyIncomeKobo ? Number(monthlyIncomeKobo) : undefined,
      }),
    onSuccess: async () => {
      setSuccess('Goal saved');
      await queryClient.invalidateQueries({ queryKey: ['goal', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stability'] });
    },
  });

  useEffect(() => {
    if (!dueDate) {
      // setting initial state once on mount; acceptable here
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDueDate(new Date(Date.now() + 120 * 86400000).toISOString());
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenShell title="Active Goal">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Active Goal</Text>
        {activeGoalQuery.isPending ? <Text>Loading...</Text> : null}
        {activeGoalQuery.error ? (
          <Text style={styles.muted}>No active goal yet. Create one below.</Text>
        ) : null}
        {activeGoalQuery.data ? (
          <>
            <Text>Name: {activeGoalQuery.data.name}</Text>
            <Text>Amount: {toNaira(activeGoalQuery.data.amountTotalKobo)}</Text>
            <Text>Due: {new Date(activeGoalQuery.data.dueDate).toDateString()}</Text>
            <Text>
              Monthly income:{' '}
              {activeGoalQuery.data.monthlyIncomeKobo === null
                ? 'n/a'
                : toNaira(activeGoalQuery.data.monthlyIncomeKobo || 0)}
            </Text>
          </>
        ) : null}
      </View>

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Amount (kobo)</Text>
      <TextInput
        style={styles.input}
        value={amountKobo}
        keyboardType="number-pad"
        onChangeText={setAmountKobo}
      />

      <Text style={styles.label}>Due Date (ISO)</Text>
      <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} />

      <Text style={styles.label}>Monthly Income (kobo, optional)</Text>
      <TextInput
        style={styles.input}
        value={monthlyIncomeKobo}
        keyboardType="number-pad"
        onChangeText={setMonthlyIncomeKobo}
      />

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
          {mutation.isPending ? 'Saving...' : 'Save Active Goal'}
        </Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontWeight: '700', marginBottom: 4 },
  label: { fontWeight: '600', color: '#25324a' },
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
  success: { color: '#0a7d29', fontWeight: '700' },
  muted: { color: '#56627a' },
});
