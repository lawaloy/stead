import { Injectable } from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { NotificationQueueService } from './notification-queue.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly queue: NotificationQueueService,
    private readonly sms: SmsService,
  ) {}

  async enqueueOtpRequested(
    phone: string,
    otp: string,
  ): Promise<{ ok: true; jobId: string }> {
    const jobId = await this.queue.enqueueOtpRequested({ phone, otp });
    return { ok: true, jobId };
  }

  async getInspection(limit: number) {
    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    const [summary, recentJobs] = await Promise.all([
      this.queue.getStatusSummary(),
      this.queue.listRecentJobs(boundedLimit),
    ]);

    return {
      provider: this.sms.getProviderInspection(),
      jobs: {
        summary: {
          pending: summary.pending ?? 0,
          processing: summary.processing ?? 0,
          sent: summary.sent ?? 0,
          failed: summary.failed ?? 0,
          deadLetter: summary.dead_letter ?? 0,
        },
        recent: recentJobs.map((job) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          nextRunAt: job.nextRunAt,
          lockedAt: job.lockedAt ?? null,
          sentAt: job.sentAt ?? null,
          failedAt: job.failedAt ?? null,
          lastError: job.lastError ?? null,
          provider: job.provider ?? null,
          providerMessageId: job.providerMessageId ?? null,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          payload: {
            phone: this.maskPhone(job.payload.phone),
          },
        })),
      },
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}
