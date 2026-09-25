import React, { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  TransactionImportPreview,
  TransactionImportResult,
} from '../../src/contracts/generated/types.gen';
import { ScreenShell } from '../../src/components/screen-shell';
import {
  ApiError,
  confirmTransactionImport,
  getActiveGoal,
  previewTransactionImport,
} from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth-state';
import { queryClient } from '../../src/lib/query-client';
import { sessionQueryKeys } from '../../src/lib/session-query-cache';
import { pickTransactionCsv } from '../../src/lib/transaction-import-file';
import {
  formatKoboAsNaira,
  formatTransactionDate,
} from '../../src/lib/transactions';

export default function ImportTransactionsScreen() {
  const { token } = useAuth();
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [tagGoal, setTagGoal] = useState(false);
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<TransactionImportResult | null>(null);

  const activeGoalQuery = useQuery({
    queryKey: sessionQueryKeys.activeGoal(token),
    queryFn: getActiveGoal,
    enabled: Boolean(token),
    retry: false,
  });

  const previewMutation = useMutation({
    mutationFn: previewTransactionImport,
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setSelectedRows(
        new Set(
          nextPreview.rows
            .filter((row) => !row.error && !row.duplicate)
            .map((row) => row.rowNumber),
        ),
      );
    },
  });
  const confirmMutation = useMutation({
    mutationFn: confirmTransactionImport,
    onSuccess: async (nextResult) => {
      setResult(nextResult);
      setPreview(null);
      setSelectedRows(new Set());
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: sessionQueryKeys.transactions(token),
        }),
        queryClient.invalidateQueries({
          queryKey: sessionQueryKeys.dashboard(token),
        }),
      ]);
    },
  });

  const selectedCount = selectedRows.size;
  const selectedTotalKobo = useMemo(
    () =>
      preview?.rows.reduce(
        (total, row) =>
          selectedRows.has(row.rowNumber) && row.amountKobo !== null
            ? total + row.amountKobo
            : total,
        0,
      ) ?? 0,
    [preview, selectedRows],
  );

  const chooseFile = async () => {
    setFileError('');
    setResult(null);
    previewMutation.reset();
    confirmMutation.reset();
    try {
      const picked = await pickTransactionCsv();
      if (!picked) return;
      setPreview(null);
      setSelectedRows(new Set());
      setFileName(picked.name);
      setCsv(picked.csv);
      previewMutation.mutate({ csv: picked.csv });
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : 'Unable to read that CSV file.',
      );
    }
  };

  const toggleRow = (rowNumber: number) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const confirmImport = () => {
    if (selectedRows.size === 0) return;
    confirmMutation.mutate({
      csv,
      rowNumbers: [...selectedRows].sort((left, right) => left - right),
      goalId: tagGoal ? activeGoalQuery.data?.id : undefined,
    });
  };

  const previewError = previewMutation.error as ApiError | null;
  const confirmError = confirmMutation.error as ApiError | null;

  return (
    <ScreenShell title="Import activity">
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Import a CSV statement</Text>
        <Text style={styles.muted}>
          Use columns date, description, amount, and type. Dates use YYYY-MM-DD;
          type can be income, expense, credit, or debit. Nothing is saved until
          you review and confirm.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose transaction CSV file"
          accessibilityState={{
            disabled: previewMutation.isPending || confirmMutation.isPending,
          }}
          disabled={previewMutation.isPending || confirmMutation.isPending}
          onPress={() => void chooseFile()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {previewMutation.isPending ? 'Checking file…' : 'Choose CSV file'}
          </Text>
        </Pressable>
        {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}
      </View>

      {fileError || previewError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {fileError || previewError?.message}
        </Text>
      ) : null}

      {result ? (
        <View style={styles.successCard} accessibilityRole="summary">
          <Text style={styles.sectionTitle}>Import complete</Text>
          <Text style={styles.successText}>
            {result.importedCount} imported; {result.duplicateCount} already
            existed and were skipped.
          </Text>
          <Link href="/(app)/transactions">
            <Text style={styles.linkText}>Return to activity</Text>
          </Link>
        </View>
      ) : null}

      {preview ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Review before importing</Text>
            <Text style={styles.muted}>
              {preview.readyCount} ready · {preview.duplicateCount} duplicate ·{' '}
              {preview.invalidCount} needs correction
            </Text>
            <Text style={styles.total}>
              Selected: {selectedCount} ({formatKoboAsNaira(selectedTotalKobo)})
            </Text>
            {activeGoalQuery.data ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: tagGoal }}
                accessibilityLabel={`Link imported transactions to ${activeGoalQuery.data.name}`}
                onPress={() => setTagGoal((current) => !current)}
                style={styles.checkboxRow}
              >
                <View
                  style={[styles.checkbox, tagGoal && styles.checkboxActive]}
                />
                <Text style={styles.checkboxLabel}>
                  Link all selected rows to {activeGoalQuery.data.name}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {preview.rows.map((row) => {
            const unavailable = Boolean(row.error || row.duplicate);
            return (
              <Pressable
                key={row.rowNumber}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: selectedRows.has(row.rowNumber),
                  disabled: unavailable || confirmMutation.isPending,
                }}
                accessibilityLabel={`CSV row ${row.rowNumber}${
                  row.note ? ` ${row.note}` : ''
                }`}
                disabled={unavailable || confirmMutation.isPending}
                onPress={() => toggleRow(row.rowNumber)}
                style={[styles.rowCard, unavailable && styles.disabled]}
              >
                <View style={styles.rowHeading}>
                  <View
                    style={[
                      styles.checkbox,
                      selectedRows.has(row.rowNumber) && styles.checkboxActive,
                    ]}
                  />
                  <Text style={styles.rowTitle}>
                    Row {row.rowNumber}: {row.note || 'Invalid row'}
                  </Text>
                </View>
                {row.occurredAt && row.amountKobo !== null ? (
                  <Text style={styles.muted}>
                    {formatTransactionDate(row.occurredAt)} ·{' '}
                    {row.direction === 'in' ? 'Income' : 'Expense'} ·{' '}
                    {formatKoboAsNaira(row.amountKobo)}
                  </Text>
                ) : null}
                {row.duplicate ? (
                  <Text style={styles.warning}>Already imported</Text>
                ) : null}
                {row.error ? (
                  <Text style={styles.error}>{row.error}</Text>
                ) : null}
              </Pressable>
            );
          })}

          {confirmError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {confirmError.message}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                selectedCount === 0 ||
                previewMutation.isPending ||
                confirmMutation.isPending,
            }}
            disabled={
              selectedCount === 0 ||
              previewMutation.isPending ||
              confirmMutation.isPending
            }
            onPress={confirmImport}
            style={[
              styles.primaryButton,
              (selectedCount === 0 ||
                previewMutation.isPending ||
                confirmMutation.isPending) &&
                styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {confirmMutation.isPending
                ? 'Importing…'
                : `Import ${selectedCount} selected`}
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  successCard: {
    backgroundColor: '#e8f7ed',
    borderWidth: 1,
    borderColor: '#9dd8ad',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { color: '#0f1c2f', fontSize: 18, fontWeight: '800' },
  muted: { color: '#60708a', lineHeight: 20 },
  fileName: { color: '#25324a', fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#0f6fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '700' },
  total: { color: '#0f1c2f', fontSize: 16, fontWeight: '800' },
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
  rowCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#25324a', fontWeight: '700', flex: 1 },
  error: { color: '#c02020' },
  warning: { color: '#8a5500', fontWeight: '700' },
  successText: { color: '#0a6423' },
  linkText: { color: '#0f4fcc', fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
