import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationJob } from './notification.types';
import { runWithCorrelationId } from '../observability/request-context';

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
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const job = await this.queue.claimReadyJob();
      if (!job) return;
      await runWithCorrelationId(job.correlationId, () =>
        this.processClaimedJob(job),
      );
    } catch (error: unknown) {
      this.logger.error('Notification poll failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processClaimedJob(job: NotificationJob) {
    if (!(await this.queue.canDeliver(job))) {
      this.logger.log('Notification job cancelled during account deletion', {
        jobId: job.id,
        type: job.type,
      });
      return;
    }

    try {
      const result = await this.processJob(job);
      await this.queue.markSucceeded(job, result);
      this.logger.log('Notification job sent', {
        jobId: job.id,
        type: job.type,
        provider: result.provider ?? 'unknown',
        attempt: job.attempts + 1,
      });
    } catch (error: unknown) {
      await this.queue.markFailed(job, error);
      this.logger.warn('Notification job failed', {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts + 1,
        terminal: job.attempts + 1 >= job.maxAttempts,
        errorName: error instanceof Error ? error.name : 'UnknownError',
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
