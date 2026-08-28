import React, { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  Transaction,
  UpdateTransactionRequest,
} from '../../src/contracts/generated/types.gen';
import {
  ApiError,
  deleteTransaction,
  getActiveGoal,
  listTransactions,
  updateTransaction,
} from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { queryClient } from '../../src/lib/query-client';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';
import {
  buildTransactionUpdatePayload,
  calculateNetKobo,
  dateInputToIso,
  filterTransactions,
  formatKoboAsNaira,
  formatTransactionDate,
  isoToDateInput,
  koboToNairaInput,
  nairaInputToKobo,
} from '../../src/lib/transactions';
import type { TransactionFilter } from '../../src/lib/transactions';
import { ScreenShell } from '../../src/components/screen-shell';

const filters: { label: string; value: TransactionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'in' },
  { label: 'Expenses', value: 'out' },
];

const refreshFinanceQueries = async (sessionId: string | null) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: sessionQueryKeys.transactions(sessionId),
    }),
    queryClient.invalidateQueries({
      queryKey: sessionQueryKeys.dashboard(sessionId),
    }),
    queryClient.invalidateQueries({
      queryKey: sessionQueryKeys.activeGoal(sessionId),
    }),
  ]);
};

export default function TransactionsScreen() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [direction, setDirection] = useState<Transaction['direction']>('in');
  const [amountNaira, setAmountNaira] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [note, setNote] = useState('');
  const [tagGoal, setTagGoal] = useState(false);

  const transactionsQuery = useQuery({
    queryKey: sessionQueryKeys.transactions(token),
    queryFn: () => listTransactions(),
    enabled: Boolean(token),
    retry: 1,
  });
  const activeGoalQuery = useQuery({
    queryKey: sessionQueryKeys.activeGoal(token),
    queryFn: getActiveGoal,
    enabled: Boolean(token),
    retry: false,
  });

  const visibleTransactions = useMemo(
    () => filterTransactions(transactionsQuery.data ?? [], filter),
    [filter, transactionsQuery.data],
  );
  const visibleNetKobo = useMemo(
    () => calculateNetKobo(visibleTransactions),
    [visibleTransactions],
  );

  const validation = useMemo(() => {
    if (!editing) return '';
    if (nairaInputToKobo(amountNaira) === null) {
      return 'Enter an amount greater than zero with at most two decimal places.';
    }
    if (dateInputToIso(occurredOn) === null) {
      return 'Enter a valid date in YYYY-MM-DD format.';
    }
    if (note.length > 280) return 'Note must be 280 characters or fewer.';
    if (tagGoal && !editing.goalId && !activeGoalQuery.data) {
      return 'Create an active goal before linking this transaction.';
    }
    return '';
  }, [
    activeGoalQuery.data,
    amountNaira,
    editing,
    note.length,
    occurredOn,
    tagGoal,
  ]);

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateTransactionRequest;
    }) => updateTransaction(id, payload),
    onSuccess: async () => {
      setEditing(null);
      await refreshFinanceQueries(token);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => refreshFinanceQueries(token),
  });

  const beginEdit = (transaction: Transaction) => {
    updateMutation.reset();
    setEditing(transaction);
    setDirection(transaction.direction);
    setAmountNaira(koboToNairaInput(transaction.amountKobo));
    setOccurredOn(isoToDateInput(transaction.occurredAt));
    setNote(transaction.note ?? '');
    setTagGoal(transaction.goalId !== null);
  };

  const saveEdit = () => {
    if (!editing || validation) return;
    const payload = buildTransactionUpdatePayload({
      direction,
      amountNaira,
      occurredOn,
      note,
      tagGoal,
      wasLinked: editing.goalId !== null,
      activeGoalId: activeGoalQuery.data?.id,
    });
    if (!payload) return;

    updateMutation.mutate({ id: editing.id, payload });
  };

  const confirmDelete = (transaction: Transaction) => {
    Alert.alert(
      'Delete transaction?',
      `${formatKoboAsNaira(transaction.amountKobo)} will be removed and your dashboard will be recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(transaction.id),
        },
      ],
    );
  };

  return (
    <ScreenShell title="Activity">
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>VISIBLE NET</Text>
          <Text style={styles.netAmount}>
            {formatKoboAsNaira(visibleNetKobo)}
          </Text>
          <Text style={styles.muted}>
            {visibleTransactions.length}{' '}
            {visibleTransactions.length === 1 ? 'transaction' : 'transactions'}
          </Text>
        </View>
        <Link href="/(app)/add-transaction" asChild>
          <Pressable style={styles.primaryButton} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Add transaction</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {filters.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === item.value }}
            onPress={() => setFilter(item.value)}
            style={[
              styles.filterButton,
              filter === item.value && styles.filterButtonActive,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === item.value && styles.filterButtonTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {editing ? (
        <View style={styles.editCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Edit transaction</Text>
            <Pressable
              onPress={() => setEditing(null)}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>Cancel</Text>
            </Pressable>
          </View>

          <View style={styles.segment}>
            {(['in', 'out'] as const).map((value) => (
              <Pressable
                key={value}
                style={[
                  styles.segmentButton,
                  direction === value && styles.segmentButtonActive,
                ]}
                onPress={() => setDirection(value)}
              >
                <Text style={styles.segmentText}>
                  {value === 'in' ? 'Income' : 'Expense'}
                </Text>
              </Pressable>
            ))}
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
            onPress={() => setTagGoal((current) => !current)}
            style={styles.checkboxRow}
          >
            <View style={[styles.checkbox, tagGoal && styles.checkboxActive]} />
            <Text style={styles.checkboxLabel}>
              Count toward {activeGoalQuery.data?.name ?? 'the linked goal'}
            </Text>
          </Pressable>

          {validation ? <Text style={styles.error}>{validation}</Text> : null}
          {updateMutation.error ? (
            <Text style={styles.error}>
              {(updateMutation.error as ApiError).message}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={Boolean(validation) || updateMutation.isPending}
            onPress={saveEdit}
            style={[
              styles.primaryButton,
              styles.fullWidthButton,
              (Boolean(validation) || updateMutation.isPending) &&
                styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {updateMutation.isPending ? 'Saving...' : 'Save changes'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {transactionsQuery.isPending ? (
        <Text>Loading transactions...</Text>
      ) : null}
      {transactionsQuery.error ? (
        <View style={styles.messageCard}>
          <Text style={styles.error}>We could not load your activity.</Text>
          <Pressable
            onPress={() => transactionsQuery.refetch()}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {deleteMutation.error ? (
        <Text style={styles.error}>
          {(deleteMutation.error as ApiError).message}
        </Text>
      ) : null}

      {!transactionsQuery.isPending &&
      !transactionsQuery.error &&
      visibleTransactions.length === 0 ? (
        <View style={styles.messageCard}>
          <Text style={styles.sectionTitle}>
            {filter === 'all'
              ? 'No transactions yet'
              : 'Nothing in this filter'}
          </Text>
          <Text style={styles.muted}>
            {filter === 'all'
              ? 'Add income or an expense to start building your financial picture.'
              : 'Choose another filter to see the rest of your activity.'}
          </Text>
        </View>
      ) : null}

      {visibleTransactions.map((transaction) => (
        <View key={transaction.id} style={styles.transactionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.transactionHeading}>
              <View
                style={[
                  styles.directionBadge,
                  transaction.direction === 'in'
                    ? styles.incomeBadge
                    : styles.expenseBadge,
                ]}
              >
                <Text
                  style={
                    transaction.direction === 'in'
                      ? styles.incomeText
                      : styles.expenseText
                  }
                >
                  {transaction.direction === 'in' ? 'INCOME' : 'EXPENSE'}
                </Text>
              </View>
              <Text style={styles.transactionDate}>
                {formatTransactionDate(transaction.occurredAt)}
              </Text>
            </View>
            <Text
              style={[
                styles.amount,
                transaction.direction === 'in'
                  ? styles.incomeText
                  : styles.expenseText,
              ]}
            >
              {transaction.direction === 'in' ? '+' : '-'}
              {formatKoboAsNaira(transaction.amountKobo)}
            </Text>
          </View>

          <Text style={styles.note}>{transaction.note || 'No note'}</Text>
          <Text style={styles.goalTag}>
            {transaction.goalId
              ? 'Counts toward a goal'
              : 'Not linked to a goal'}
          </Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => beginEdit(transaction)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={deleteMutation.isPending}
              onPress={() => confirmDelete(transaction)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#0f1c2f',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  eyebrow: {
    color: '#a9bddb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  netAmount: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  muted: { color: '#60708a', lineHeight: 20 },
  primaryButton: {
    backgroundColor: '#0f6fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8 },
  filterButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  filterButtonActive: { backgroundColor: '#0f1c2f', borderColor: '#0f1c2f' },
  filterButtonText: { color: '#33415c', fontWeight: '700' },
  filterButtonTextActive: { color: '#ffffff' },
  editCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#a9bddb',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionTitle: { color: '#0f1c2f', fontSize: 18, fontWeight: '800' },
  linkText: { color: '#0f4fcc', fontWeight: '700' },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#e7eef9',
    borderRadius: 10,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentButtonActive: { backgroundColor: '#ffffff' },
  segmentText: { color: '#25324a', fontWeight: '700' },
  label: { color: '#25324a', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#c8d1e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: '#6a7690',
    borderRadius: 4,
  },
  checkboxActive: { backgroundColor: '#0f6fff', borderColor: '#0f6fff' },
  checkboxLabel: { color: '#25324a', flex: 1 },
  error: { color: '#c02020' },
  fullWidthButton: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  messageCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  transactionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  transactionHeading: { gap: 6 },
  directionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  incomeBadge: { backgroundColor: '#e8f7ed' },
  expenseBadge: { backgroundColor: '#fdecec' },
  incomeText: { color: '#0a7d29', fontWeight: '800' },
  expenseText: { color: '#c02020', fontWeight: '800' },
  transactionDate: { color: '#60708a', fontSize: 13 },
  amount: { fontSize: 18, fontWeight: '800' },
  note: { color: '#25324a', fontSize: 16 },
  goalTag: { color: '#56627a', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0f6fff',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0f4fcc', fontWeight: '700' },
  deleteButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#efb8b8',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  deleteButtonText: { color: '#c02020', fontWeight: '700' },
});
