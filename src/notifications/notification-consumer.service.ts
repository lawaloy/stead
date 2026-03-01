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

    const job = this.queue.claimReadyJob();
    if (!job) return;

    this.isProcessing = true;
    try {
      await this.processJob(job);
      this.queue.markSucceeded(job.id);
    } catch (error: unknown) {
      this.queue.markFailed(job, error);
      this.logger.warn(
        `Notification job failed id=${job.id} type=${job.type} attempts=${
          job.attempts + 1
        }`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: NotificationJob) {
    switch (job.type) {
      case 'otp.requested': {
        await this.sms.sendOtp(job.payload.phone, job.payload.otp);
        return;
      }
      default:
        throw new Error('Unsupported notification job type');
    }
  }
}
