import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Goal, GoalStatus } from '../../src/contracts/generated/types.gen';
import { ScreenShell } from '../../src/components/screen-shell';
import {
  ApiError,
  createGoal,
  endGoal,
  getActiveGoal,
  listGoals,
  updateGoal,
} from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import {
  buildCreateGoalPayload,
  buildUpdateGoalPayload,
  goalFormValidationError,
  goalToFormFields,
  type GoalFormFields,
} from '../../src/lib/goal-form';
import { queryClient } from '../../src/lib/query-client';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';
import { formatKoboAsNaira } from '../../src/lib/transactions';

type FormMode = 'create' | 'edit' | 'replace' | 'view';

const futureDateInput = () =>
  new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

const emptyForm = (): GoalFormFields => ({
  name: '',
  amountNaira: '',
  dueOn: futureDateInput(),
  monthlyIncomeNaira: '',
});

const statusLabel: Record<GoalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  replaced: 'Replaced',
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const loadActiveGoal = async (): Promise<Goal | null> => {
  try {
    return await getActiveGoal();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export default function GoalScreen() {
  const { token } = useAuth();
  const [mode, setMode] = useState<FormMode>('view');
  const [form, setForm] = useState<GoalFormFields>(emptyForm);
  const [success, setSuccess] = useState('');

  const activeGoalQuery = useQuery({
    queryKey: sessionQueryKeys.activeGoal(token),
    queryFn: loadActiveGoal,
    enabled: Boolean(token),
    retry: 1,
  });
  const historyQuery = useQuery({
    queryKey: sessionQueryKeys.goalHistory(token),
    queryFn: listGoals,
    enabled: Boolean(token),
  });

  const activeGoal = activeGoalQuery.data ?? undefined;
  const activeMissing = activeGoalQuery.data === null;
  const history = (historyQuery.data ?? []).filter((goal) => !goal.isActive);
  const effectiveMode = activeMissing && mode === 'view' ? 'create' : mode;
  const formVisible = effectiveMode !== 'view';
  const validation = useMemo(
    () => (formVisible ? goalFormValidationError(form) : ''),
    [form, formVisible],
  );

  const refreshGoals = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['goal', 'active'] }),
      queryClient.invalidateQueries({ queryKey: ['goals', 'history'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stability'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (effectiveMode === 'edit' && activeGoal) {
        const payload = buildUpdateGoalPayload(form);
        if (!payload) throw new Error('Goal form is invalid');
        return updateGoal(activeGoal.id, payload);
      }

      const payload = buildCreateGoalPayload(form);
      if (!payload) throw new Error('Goal form is invalid');
      return createGoal(payload);
    },
    onSuccess: async (goal) => {
      setSuccess(
        effectiveMode === 'edit'
          ? 'Goal changes saved'
          : effectiveMode === 'replace'
            ? 'Replacement goal started'
            : 'Goal created',
      );
      queryClient.setQueryData(sessionQueryKeys.activeGoal(token), goal);
      setMode('view');
      await refreshGoals();
    },
  });

  const endMutation = useMutation({
    mutationFn: ({
      goal,
      status,
    }: {
      goal: Goal;
      status: 'completed' | 'cancelled';
    }) => endGoal(goal.id, { status }),
    onSuccess: async (goal) => {
      setSuccess(
        goal.status === 'completed'
          ? 'Goal marked completed'
          : 'Goal cancelled',
      );
      queryClient.setQueryData<Goal | null>(
        sessionQueryKeys.activeGoal(token),
        null,
      );
      setForm(emptyForm());
      setMode('create');
      await refreshGoals();
    },
  });

  const updateField = (field: keyof GoalFormFields, value: string) => {
    setSuccess('');
    setForm((current) => ({ ...current, [field]: value }));
  };

  const confirmEnd = (status: 'completed' | 'cancelled') => {
    if (!activeGoal) return;
    const completing = status === 'completed';
    Alert.alert(
      completing ? 'Mark goal completed?' : 'Cancel this goal?',
      completing
        ? 'This moves the goal into history and clears the active dashboard goal.'
        : 'This moves the goal into history. Its linked transactions are preserved.',
      [
        { text: 'Keep goal', style: 'cancel' },
        {
          text: completing ? 'Mark completed' : 'Cancel goal',
          style: completing ? 'default' : 'destructive',
          onPress: () => endMutation.mutate({ goal: activeGoal, status }),
        },
      ],
    );
  };

  const submit = () => {
    setSuccess('');
    if (effectiveMode !== 'replace') {
      saveMutation.mutate();
      return;
    }

    Alert.alert(
      'Replace active goal?',
      'The current goal will move to history. Its linked transactions will stay attached to it.',
      [
        { text: 'Keep current goal', style: 'cancel' },
        { text: 'Start replacement', onPress: () => saveMutation.mutate() },
      ],
    );
  };

  const mutationError = saveMutation.error ?? endMutation.error;

  return (
    <ScreenShell title="Goals">
      <View style={styles.card} accessible accessibilityLabel="Current goal">
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Current goal
        </Text>
        {activeGoalQuery.isLoading ? (
          <Text>Loading current goal...</Text>
        ) : null}
        {activeGoalQuery.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            Could not load your current goal. Check your connection and retry.
          </Text>
        ) : null}
        {activeMissing ? <Text>No active goal yet.</Text> : null}
        {activeGoal ? (
          <>
            <Text style={styles.goalName}>{activeGoal.name}</Text>
            <Text>Target: {formatKoboAsNaira(activeGoal.amountTotalKobo)}</Text>
            <Text>Due: {formatDate(activeGoal.dueDate)}</Text>
            <Text>
              Monthly income:{' '}
              {activeGoal.monthlyIncomeKobo === null
                ? 'Not provided'
                : formatKoboAsNaira(activeGoal.monthlyIncomeKobo)}
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() => {
                  setForm(goalToFormFields(activeGoal));
                  setMode('edit');
                  setSuccess('');
                }}
              >
                <Text style={styles.secondaryButtonText}>Edit goal</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() => {
                  setForm(emptyForm());
                  setMode('replace');
                  setSuccess('');
                }}
              >
                <Text style={styles.secondaryButtonText}>Replace goal</Text>
              </Pressable>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.completeButton}
                onPress={() => confirmEnd('completed')}
              >
                <Text style={styles.completeButtonText}>Mark completed</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.dangerButton}
                onPress={() => confirmEnd('cancelled')}
              >
                <Text style={styles.dangerButtonText}>Cancel goal</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {formVisible ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {effectiveMode === 'edit'
              ? 'Edit current goal'
              : effectiveMode === 'replace'
                ? 'Start a replacement goal'
                : 'Create a goal'}
          </Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            accessibilityLabel="Goal name"
            style={styles.input}
            value={form.name}
            onChangeText={(value) => updateField('name', value)}
          />
          <Text style={styles.label}>Target amount (naira)</Text>
          <TextInput
            accessibilityLabel="Goal target amount in naira"
            style={styles.input}
            value={form.amountNaira}
            keyboardType="decimal-pad"
            onChangeText={(value) => updateField('amountNaira', value)}
          />
          <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
          <TextInput
            accessibilityLabel="Goal due date"
            style={styles.input}
            value={form.dueOn}
            onChangeText={(value) => updateField('dueOn', value)}
          />
          <Text style={styles.label}>Monthly income (naira, optional)</Text>
          <TextInput
            accessibilityLabel="Monthly income in naira"
            style={styles.input}
            value={form.monthlyIncomeNaira}
            keyboardType="decimal-pad"
            onChangeText={(value) => updateField('monthlyIncomeNaira', value)}
          />
          {validation ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {validation}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.button,
                (Boolean(validation) || saveMutation.isPending) &&
                  styles.buttonDisabled,
              ]}
              disabled={Boolean(validation) || saveMutation.isPending}
              onPress={submit}
            >
              <Text style={styles.buttonText}>
                {saveMutation.isPending
                  ? 'Saving...'
                  : effectiveMode === 'edit'
                    ? 'Save changes'
                    : effectiveMode === 'replace'
                      ? 'Create replacement'
                      : 'Create goal'}
              </Text>
            </Pressable>
            {activeGoal ? (
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryButton}
                onPress={() => setMode('view')}
              >
                <Text style={styles.secondaryButtonText}>Close form</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {mutationError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {(mutationError as ApiError).message}
        </Text>
      ) : null}
      {success ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {success}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Goal history
        </Text>
        {historyQuery.isLoading ? <Text>Loading goal history...</Text> : null}
        {historyQuery.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            Could not load goal history.
          </Text>
        ) : null}
        {!historyQuery.isLoading &&
        !historyQuery.error &&
        history.length === 0 ? (
          <Text style={styles.muted}>
            Completed, cancelled, and replaced goals appear here.
          </Text>
        ) : null}
        {history.map((goal) => (
          <View
            key={goal.id}
            style={styles.historyItem}
            accessible
            accessibilityLabel={`${goal.name}, ${statusLabel[goal.status]}, target ${formatKoboAsNaira(goal.amountTotalKobo)}`}
          >
            <View style={styles.historyHeading}>
              <Text style={styles.goalName}>{goal.name}</Text>
              <Text style={styles.status}>{statusLabel[goal.status]}</Text>
            </View>
            <Text>Target: {formatKoboAsNaira(goal.amountTotalKobo)}</Text>
            <Text>Due: {formatDate(goal.dueDate)}</Text>
            {goal.endedAt ? (
              <Text>Ended: {formatDate(goal.endedAt)}</Text>
            ) : null}
          </View>
        ))}
      </View>
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
    gap: 8,
  },
  cardTitle: { fontWeight: '700', fontSize: 17 },
  goalName: { fontWeight: '700', color: '#17233d' },
  label: { fontWeight: '600', color: '#25324a' },
  input: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    backgroundColor: '#0f6fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: {
    borderColor: '#8ba3ca',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: { color: '#24466f', fontWeight: '700' },
  completeButton: {
    backgroundColor: '#e4f6e9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  completeButtonText: { color: '#176b32', fontWeight: '700' },
  dangerButton: {
    backgroundColor: '#fff0f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dangerButtonText: { color: '#a51d1d', fontWeight: '700' },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: '#e5eaf2',
    paddingTop: 10,
    gap: 3,
  },
  historyHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  status: { color: '#56627a', fontWeight: '600' },
  error: { color: '#c02020' },
  success: { color: '#0a7d29', fontWeight: '700' },
  muted: { color: '#56627a' },
});
