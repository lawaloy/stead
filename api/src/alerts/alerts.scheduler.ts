import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  OBSERVABILITY_METRICS,
  type ObservabilityMetrics,
} from '../observability/metrics';
import { runWithOperationId } from '../observability/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    @Inject(OBSERVABILITY_METRICS)
    private readonly metrics: ObservabilityMetrics,
  ) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(now = new Date()) {
    const preferences = await this.prisma.alertPreference.findMany({
      where: {
        OR: [{ weeklySummaryEnabled: true }, { riskAlertsEnabled: true }],
      },
      select: { userId: true },
    });
    for (const preference of preferences) {
      await this.alerts.evaluateUser(preference.userId, now);
    }
    return preferences.length;
  }

  private async tick() {
    const operationId = randomUUID();
    return runWithOperationId(operationId, async () => {
      if (this.running) {
        this.metrics.recordSchedulerRun({
          outcome: 'skipped',
          durationMs: 0,
        });
        return;
      }

      const started = performance.now();
      let outcome: 'success' | 'error' = 'error';
      this.running = true;
      try {
        const evaluatedUsers = await this.run();
        outcome = 'success';
        this.logger.log('Readiness alert evaluation completed', {
          evaluatedUsers,
          durationMs: performance.now() - started,
        });
      } catch (error: unknown) {
        this.logger.error('Readiness alert evaluation failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      } finally {
        this.metrics.recordSchedulerRun({
          outcome,
          durationMs: performance.now() - started,
        });
        this.running = false;
      }
    });
  }
}
