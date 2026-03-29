import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationJob, OtpRequestedPayload } from './notification.types';

@Injectable()
export class NotificationQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueOtpRequested(payload: OtpRequestedPayload): Promise<string> {
    const job = await this.prisma.notificationJob.create({
      data: {
        type: 'otp.requested',
        payloadJson: JSON.stringify(payload),
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
      },
    });

    return job.id;
  }

  async claimReadyJob(): Promise<NotificationJob | null> {
    const now = new Date();
    const candidate = await this.prisma.notificationJob.findFirst({
      where: {
        status: 'pending',
        nextRunAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) return null;

    const claimed = await this.prisma.notificationJob.updateMany({
      where: {
        id: candidate.id,
        status: 'pending',
      },
      data: {
        status: 'processing',
        lockedAt: now,
      },
    });

    if (claimed.count === 0) return null;

    return this.mapJob(
      await this.prisma.notificationJob.findUniqueOrThrow({
        where: { id: candidate.id },
      }),
    );
  }

  async markSucceeded(
    jobId: string,
    input?: { provider?: string | null; providerMessageId?: string | null },
  ): Promise<void> {
    await this.prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        provider: input?.provider || undefined,
        providerMessageId: input?.providerMessageId || undefined,
        lastError: null,
        failedAt: null,
        lockedAt: null,
      },
    });
  }

  async markFailed(job: NotificationJob, error: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const terminal = attempts >= job.maxAttempts;
    const now = new Date();
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown notification error';

    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        attempts,
        status: terminal ? 'dead_letter' : 'pending',
        nextRunAt: terminal
          ? job.nextRunAt
          : new Date(Date.now() + this.backoffMs(attempts)),
        failedAt: now,
        lastError: errorMessage,
        lockedAt: null,
      },
    });
  }

  async getQueueDepth(): Promise<number> {
    return this.prisma.notificationJob.count({
      where: { status: { in: ['pending', 'processing'] } },
    });
  }

  async getDeadLetterDepth(): Promise<number> {
    return this.prisma.notificationJob.count({
      where: { status: 'dead_letter' },
    });
  }

  private mapJob(job: {
    id: string;
    type: string;
    payloadJson: string;
    status:
      | 'pending'
      | 'processing'
      | 'sent'
      | 'failed'
      | 'dead_letter';
    attempts: number;
    maxAttempts: number;
    nextRunAt: Date;
    lockedAt: Date | null;
    sentAt: Date | null;
    failedAt: Date | null;
    lastError: string | null;
    provider: string | null;
    providerMessageId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): NotificationJob {
    return {
      id: job.id,
      type: 'otp.requested',
      payload: JSON.parse(job.payloadJson) as OtpRequestedPayload,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      nextRunAt: job.nextRunAt,
      lockedAt: job.lockedAt,
      sentAt: job.sentAt,
      failedAt: job.failedAt,
      lastError: job.lastError,
      provider: job.provider,
      providerMessageId: job.providerMessageId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private backoffMs(attempt: number): number {
    return Math.min(30_000, 1_000 * 2 ** attempt);
  }
}
