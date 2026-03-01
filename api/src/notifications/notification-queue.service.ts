import { Injectable } from '@nestjs/common';
import {
  DeadLetterNotificationJob,
  NotificationJob,
  OtpRequestedPayload,
} from './notification.types';

@Injectable()
export class NotificationQueueService {
  private readonly queue: NotificationJob[] = [];
  private readonly inFlight = new Set<string>();
  private readonly deadLetterQueue: DeadLetterNotificationJob[] = [];

  enqueueOtpRequested(payload: OtpRequestedPayload): string {
    const now = new Date();
    const id = this.newJobId();
    this.queue.push({
      id,
      type: 'otp.requested',
      payload,
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  claimReadyJob(): NotificationJob | null {
    const now = Date.now();
    const idx = this.queue.findIndex(
      (job) => !this.inFlight.has(job.id) && job.nextRunAt.getTime() <= now,
    );

    if (idx === -1) return null;

    const [job] = this.queue.splice(idx, 1);
    this.inFlight.add(job.id);
    return job;
  }

  markSucceeded(jobId: string): void {
    this.inFlight.delete(jobId);
  }

  markFailed(job: NotificationJob, error: unknown): void {
    this.inFlight.delete(job.id);

    const attempts = job.attempts + 1;
    const now = new Date();
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown notification error';

    if (attempts >= job.maxAttempts) {
      this.deadLetterQueue.push({
        ...job,
        attempts,
        updatedAt: now,
        failedAt: now,
        lastError: errorMessage,
      });
      return;
    }

    this.queue.push({
      ...job,
      attempts,
      nextRunAt: new Date(Date.now() + this.backoffMs(attempts)),
      updatedAt: now,
    });
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  getDeadLetterDepth(): number {
    return this.deadLetterQueue.length;
  }

  private newJobId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private backoffMs(attempt: number): number {
    return Math.min(30_000, 1_000 * 2 ** attempt);
  }
}
