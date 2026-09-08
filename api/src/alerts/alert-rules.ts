import type { StabilityStatus } from '../dashboard/engine';

export const RISK_SCORE_DROP = 15;
export const RISK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type RiskBaseline = {
  lastNotifiedStatus: string | null;
  lastNotifiedScore: number | null;
  lastRiskAlertAt: Date | null;
};

const severity: Record<StabilityStatus, number> = {
  stable: 0,
  warning: 1,
  critical: 2,
};

export function riskDecision(
  current: { status: StabilityStatus; score: number },
  baseline: RiskBaseline | null,
  now: Date,
): 'risk' | 'recovery' | null {
  const previousStatus = baseline?.lastNotifiedStatus as StabilityStatus | null;
  if (current.status === 'stable') {
    return previousStatus === 'warning' || previousStatus === 'critical'
      ? 'recovery'
      : null;
  }

  const cooldownActive =
    baseline?.lastRiskAlertAt !== null &&
    baseline?.lastRiskAlertAt !== undefined &&
    now.getTime() - baseline.lastRiskAlertAt.getTime() < RISK_COOLDOWN_MS;
  if (cooldownActive) return null;

  if (!previousStatus || baseline?.lastNotifiedScore == null) return 'risk';
  if (severity[current.status] > severity[previousStatus]) return 'risk';
  if (current.score <= baseline.lastNotifiedScore - RISK_SCORE_DROP) {
    return 'risk';
  }
  return null;
}

export function alertOccurrenceKey(input: {
  type: 'risk.alert' | 'risk.recovery';
  userId: string;
  goalId: string;
  previousStatus: string | null;
  previousScore: number | null;
  currentStatus: StabilityStatus;
  currentScore: number;
  lastRiskAlertAt: Date | null;
  lastRecoveryAlertAt: Date | null;
}) {
  const occurrence =
    input.type === 'risk.alert'
      ? (input.lastRecoveryAlertAt ?? input.lastRiskAlertAt)
      : (input.lastRiskAlertAt ?? input.lastRecoveryAlertAt);
  const anchor = occurrence?.toISOString() ?? 'initial';
  return `${input.type}:${input.userId}:${input.goalId}:${anchor}:${input.previousStatus ?? 'none'}:${input.previousScore ?? 'none'}:${input.currentStatus}:${input.currentScore}`;
}

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weeklySchedule(
  now: Date,
  timeZone: string,
  scheduledDay: number,
  scheduledHour: number,
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = weekdayIndex[value('weekday')] ?? 0;
  const hour = Number(value('hour'));
  const year = Number(value('year'));
  const month = Number(value('month'));
  const date = Number(value('day'));
  const weekStart = new Date(Date.UTC(year, month - 1, date - day));
  const key = weekStart.toISOString().slice(0, 10);
  const due =
    day > scheduledDay || (day === scheduledDay && hour >= scheduledHour);
  return { due, key };
}
