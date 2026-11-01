import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { SmsService } from '../sms/sms.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationJob } from './notification.types';
import {
  OBSERVABILITY_METRICS,
  type ObservabilityMetrics,
} from '../observability/metrics';
import {
  runWithCorrelationId,
  runWithOperationId,
} from '../observability/request-context';

@Injectable()
export class NotificationConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationConsumerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly queue: NotificationQueueService,
    private readonly sms: SmsService,
    @Inject(OBSERVABILITY_METRICS)
    private readonly metrics: ObservabilityMetrics,
  ) {}

  async onModuleInit() {
    await this.queue.redactTerminalPayloads();
    this.timer = setInterval(() => {
      void this.tick();
    }, 300);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    const operationId = randomUUID();
    return runWithOperationId(operationId, async () => {
      if (this.isProcessing) {
        this.metrics.recordNotificationPoll({
          outcome: 'skipped',
          durationMs: 0,
        });
        return;
      }

      const started = performance.now();
      let outcome: 'empty' | 'processed' | 'error' = 'error';
      this.isProcessing = true;
      try {
        const job = await this.queue.claimReadyJob();
        if (!job) {
          outcome = 'empty';
          return;
        }
        await runWithCorrelationId(job.correlationId, () =>
          this.processClaimedJob(job),
        );
        outcome = 'processed';
      } catch (error: unknown) {
        this.logger.error('Notification poll failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      } finally {
        this.metrics.recordNotificationPoll({
          outcome,
          durationMs: performance.now() - started,
        });
        this.isProcessing = false;
      }
    });
  }

  private async processClaimedJob(job: NotificationJob) {
    const started = performance.now();
    let provider = 'none';
    let outcome: 'sent' | 'cancelled' | 'retry' | 'dead_letter' | 'error' =
      'error';
    try {
      if (!(await this.queue.canDeliver(job))) {
        outcome = 'cancelled';
        this.logger.log('Notification job cancelled during account deletion', {
          jobId: job.id,
          type: job.type,
        });
        return;
      }

      const result = await this.processJob(job);
      provider = result.provider ?? 'unknown';
      await this.queue.markSucceeded(job, result);
      outcome = 'sent';
      this.logger.log('Notification job sent', {
        jobId: job.id,
        type: job.type,
        provider: result.provider ?? 'unknown',
        attempt: job.attempts + 1,
      });
    } catch (error: unknown) {
      await this.queue.markFailed(job, error);
      outcome = job.attempts + 1 >= job.maxAttempts ? 'dead_letter' : 'retry';
      this.logger.warn('Notification job failed', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts + 1,
        terminal: job.attempts + 1 >= job.maxAttempts,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.metrics.recordNotificationJob({
        type: job.type,
        provider,
        outcome,
        durationMs: performance.now() - started,
      });
    }
  }

  private async processJob(job: NotificationJob) {
    switch (job.type) {
      case 'otp.requested': {
        if ('redacted' in job.payload) {
          throw new Error('OTP notification payload has been redacted');
        }
        const result = await this.sms.sendOtp(
          job.payload.phone,
          job.payload.otp,
        );
        return {
          provider: result.provider,
          providerMessageId: this.extractProviderMessageId(result.response),
        };
      }
      case 'weekly.summary':
      case 'risk.alert':
      case 'risk.recovery': {
        if ('redacted' in job.payload) {
          throw new Error('Readiness notification payload has been redacted');
        }
        const result = await this.sms.sendMessage(
          job.payload.phone,
          job.payload.body,
        );
        return {
          provider: result.provider,
          providerMessageId: this.extractProviderMessageId(result.response),
        };
      }
      default:
        throw new Error('Unsupported notification job type');
    }
  }

  private extractProviderMessageId(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const body = response as Record<string, unknown>;
    if (typeof body.sid === 'string') return body.sid;
    if (typeof body.message_id === 'string') return body.message_id;
    return null;
  }
}
