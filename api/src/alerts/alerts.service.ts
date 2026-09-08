import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AlertPreferences } from '../contracts/generated/types.gen';
import type { StabilityStatus } from '../dashboard/engine';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  NOTIFICATION_PUBLISHER,
  type NotificationPublisher,
} from '../notifications/notification-publisher';
import { PrismaService } from '../prisma/prisma.service';
import {
  alertOccurrenceKey,
  riskDecision,
  weeklySchedule,
} from './alert-rules';
import type { UpdateAlertPreferencesDto } from './dto/update-alert-preferences.dto';

const DEFAULT_PREFERENCES: AlertPreferences = {
  weeklySummaryEnabled: false,
  riskAlertsEnabled: false,
  channel: 'sms',
  timeZone: 'UTC',
  weeklyDay: 1,
  weeklyHourLocal: 9,
  updatedAt: null,
};

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notifications: NotificationPublisher,
    private readonly dashboard: DashboardService,
  ) {}

  async getPreferences(userId: string): Promise<AlertPreferences> {
    const row = await this.prisma.alertPreference.findUnique({
      where: { userId },
    });
    return row ? this.toPreferences(row) : { ...DEFAULT_PREFERENCES };
  }

  async updatePreferences(
    userId: string,
    input: UpdateAlertPreferencesDto,
  ): Promise<AlertPreferences> {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one preference is required');
    }
    if (input.timeZone !== undefined) this.assertTimeZone(input.timeZone);

    const row = await this.prisma.alertPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return this.toPreferences(row);
  }

  async evaluateUser(userId: string, now = new Date()): Promise<void> {
    const preference = await this.prisma.alertPreference.findUnique({
      where: { userId },
      include: { user: { select: { phone: true } } },
    });
    if (
      !preference ||
      (!preference.weeklySummaryEnabled && !preference.riskAlertsEnabled)
    ) {
      return;
    }

    const snapshot = await this.dashboard.getStability(userId, now);
    if (!snapshot.ok) return;
    const { goal, metrics } = snapshot;

    const state = await this.prisma.alertState.findUnique({
      where: { userId_goalId: { userId, goalId: goal.id } },
    });
    const stateUpdate: Record<string, unknown> = {
      lastObservedStatus: metrics.status,
      lastObservedScore: metrics.stabilityScore,
    };

    if (preference.weeklySummaryEnabled) {
      const schedule = weeklySchedule(
        now,
        preference.timeZone,
        preference.weeklyDay,
        preference.weeklyHourLocal,
      );
      if (schedule.due && state?.lastWeeklySummaryKey !== schedule.key) {
        await this.notifications.publishReadinessAlert({
          type: 'weekly.summary',
          userId,
          goalId: goal.id,
          dedupeKey: `weekly:${userId}:${goal.id}:${schedule.key}`,
          payload: {
            phone: preference.user.phone,
            body: this.weeklySummaryBody(goal.name, metrics),
          },
        });
        stateUpdate.lastWeeklySummaryAt = now;
        stateUpdate.lastWeeklySummaryKey = schedule.key;
      }
    }

    if (preference.riskAlertsEnabled) {
      const decision = riskDecision(
        { status: metrics.status, score: metrics.stabilityScore },
        state,
        now,
      );
      if (decision) {
        const type = decision === 'risk' ? 'risk.alert' : 'risk.recovery';
        await this.notifications.publishReadinessAlert({
          type,
          userId,
          goalId: goal.id,
          dedupeKey: alertOccurrenceKey({
            type,
            userId,
            goalId: goal.id,
            previousStatus: state?.lastNotifiedStatus ?? null,
            previousScore: state?.lastNotifiedScore ?? null,
            currentStatus: metrics.status,
            currentScore: metrics.stabilityScore,
            lastRiskAlertAt: state?.lastRiskAlertAt ?? null,
            lastRecoveryAlertAt: state?.lastRecoveryAlertAt ?? null,
          }),
          payload: {
            phone: preference.user.phone,
            body:
              decision === 'risk'
                ? this.riskBody(
                    goal.name,
                    metrics.status,
                    metrics.stabilityScore,
                  )
                : this.recoveryBody(goal.name, metrics.stabilityScore),
          },
        });
        stateUpdate.lastNotifiedStatus = metrics.status;
        stateUpdate.lastNotifiedScore = metrics.stabilityScore;
        stateUpdate[
          decision === 'risk' ? 'lastRiskAlertAt' : 'lastRecoveryAlertAt'
        ] = now;
      } else if (!state && metrics.status === 'stable') {
        stateUpdate.lastNotifiedStatus = metrics.status;
        stateUpdate.lastNotifiedScore = metrics.stabilityScore;
      }
    }

    await this.prisma.alertState.upsert({
      where: { userId_goalId: { userId, goalId: goal.id } },
      create: {
        userId,
        goalId: goal.id,
        lastObservedStatus: metrics.status,
        lastObservedScore: metrics.stabilityScore,
        lastNotifiedStatus:
          (stateUpdate.lastNotifiedStatus as StabilityStatus | undefined) ??
          null,
        lastNotifiedScore:
          (stateUpdate.lastNotifiedScore as number | undefined) ?? null,
        lastRiskAlertAt:
          (stateUpdate.lastRiskAlertAt as Date | undefined) ?? null,
        lastRecoveryAlertAt:
          (stateUpdate.lastRecoveryAlertAt as Date | undefined) ?? null,
        lastWeeklySummaryAt:
          (stateUpdate.lastWeeklySummaryAt as Date | undefined) ?? null,
        lastWeeklySummaryKey:
          (stateUpdate.lastWeeklySummaryKey as string | undefined) ?? null,
      },
      update: stateUpdate,
    });
  }

  private toPreferences(row: {
    weeklySummaryEnabled: boolean;
    riskAlertsEnabled: boolean;
    timeZone: string;
    weeklyDay: number;
    weeklyHourLocal: number;
    updatedAt: Date;
  }): AlertPreferences {
    return {
      weeklySummaryEnabled: row.weeklySummaryEnabled,
      riskAlertsEnabled: row.riskAlertsEnabled,
      channel: 'sms',
      timeZone: row.timeZone,
      weeklyDay: row.weeklyDay,
      weeklyHourLocal: row.weeklyHourLocal,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertTimeZone(timeZone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
    } catch {
      throw new BadRequestException('timeZone must be a valid IANA time zone');
    }
  }

  private weeklySummaryBody(
    goalName: string,
    metrics: {
      readinessPct: number;
      status: StabilityStatus;
      stabilityScore: number;
      paceRequiredMonthlyKobo: number;
    },
  ) {
    return `Stead weekly: ${goalName} is ${metrics.readinessPct}% ready, status ${metrics.status}, score ${metrics.stabilityScore}. Required monthly pace: ${this.naira(metrics.paceRequiredMonthlyKobo)}.`;
  }

  private riskBody(goalName: string, status: StabilityStatus, score: number) {
    return `Stead alert: ${goalName} moved to ${status} (score ${score}). Review recent spending and your required savings pace.`;
  }

  private recoveryBody(goalName: string, score: number) {
    return `Stead update: ${goalName} has recovered to stable (score ${score}). Keep up your current savings pace.`;
  }

  private naira(kobo: number) {
    return `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }
}
