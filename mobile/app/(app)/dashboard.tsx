import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDashboardStability } from '../../src/lib/api';
import { ScreenShell } from '../../src/components/screen-shell';

const koboToNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

const StatusBadge = ({ status }: { status: 'stable' | 'warning' | 'critical' }) => {
  const color =
    status === 'stable' ? '#0a7d29' : status === 'warning' ? '#b97a00' : '#c02020';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
};

export default function DashboardScreen() {
  const query = useQuery({
    queryKey: ['dashboard', 'stability'],
    queryFn: getDashboardStability,
    retry: 1,
  });

  if (query.isPending) {
    return (
      <ScreenShell title="Stability Dashboard">
        <Text>Loading stability metrics...</Text>
      </ScreenShell>
    );
  }

  if (query.error) {
    return (
      <ScreenShell title="Stability Dashboard">
        <Text style={styles.error}>Failed to load dashboard. Pull to retry.</Text>
        <ScrollView refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />} />
      </ScreenShell>
    );
  }

  if (!query.data?.ok) {
    return (
      <ScreenShell title="Stability Dashboard">
        <Text>{query.data?.message || 'No active goal found.'}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Stability Dashboard">
      <ScrollView
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{query.data.goal.name}</Text>
          <Text>Target: {koboToNaira(query.data.goal.amountTotalKobo)}</Text>
          <Text>Due: {new Date(query.data.goal.dueDate).toDateString()}</Text>
          <StatusBadge status={query.data.metrics.status} />
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Readiness</Text>
            <Text style={styles.metricValue}>{query.data.metrics.readinessPct}%</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Score</Text>
            <Text style={styles.metricValue}>{query.data.metrics.stabilityScore}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Safe To Spend</Text>
            <Text style={styles.metricValue}>{koboToNaira(query.data.metrics.safeToSpendKobo)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Required Monthly Pace</Text>
            <Text style={styles.metricValue}>
              {koboToNaira(query.data.metrics.paceRequiredMonthlyKobo)}
            </Text>
          </View>
        </View>
      </ScrollView>
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
    marginBottom: 12,
    gap: 4,
  },
  cardTitle: { fontWeight: '800', fontSize: 20, color: '#0f1c2f' },
  metricGrid: { gap: 10 },
  metricCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe3f2',
    borderRadius: 12,
    padding: 12,
  },
  metricLabel: { color: '#5a6881' },
  metricValue: { fontWeight: '800', fontSize: 22, color: '#0f1c2f' },
  badge: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontWeight: '800' },
  error: { color: '#c02020' },
});
