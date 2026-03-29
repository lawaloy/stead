import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationJob } from './notification.types';

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

  onModuleInit() {
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

    const job = await this.queue.claimReadyJob();
    if (!job) return;

    this.isProcessing = true;
    try {
      const result = await this.processJob(job);
      await this.queue.markSucceeded(job.id, result);
      this.logger.log(
        `Notification job sent id=${job.id} type=${job.type} provider=${result.provider ?? 'unknown'} phone=${this.maskPhone(job.payload.phone)}`,
      );
    } catch (error: unknown) {
      await this.queue.markFailed(job, error);
      this.logger.warn(
        `Notification job failed id=${job.id} type=${job.type} attempts=${job.attempts + 1} phone=${this.maskPhone(job.payload.phone)}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: NotificationJob) {
    switch (job.type) {
      case 'otp.requested': {
        const result = await this.sms.sendOtp(
          job.payload.phone,
          job.payload.otp,
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

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}
