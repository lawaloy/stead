import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationJob,
  OtpRequestedPayload,
  RedactedOtpRequestedPayload,
} from './notification.types';

const JOB_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const REDACTED_PAYLOAD_JSON = JSON.stringify({ redacted: true });

type EncryptedPayloadEnvelope = {
  v: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

@Injectable()
export class NotificationQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async enqueueOtpRequested(payload: OtpRequestedPayload): Promise<string> {
    const job = await this.prisma.notificationJob.create({
      data: {
        type: 'otp.requested',
        payloadJson: this.encryptPayload(payload),
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
    const staleLockBefore = new Date(now.getTime() - JOB_LOCK_TIMEOUT_MS);
    const readyWhere = {
      OR: [
        {
          status: 'pending' as const,
          nextRunAt: { lte: now },
        },
        {
          status: 'processing' as const,
          OR: [{ lockedAt: null }, { lockedAt: { lte: staleLockBefore } }],
        },
      ],
    };
    const candidate = await this.prisma.notificationJob.findFirst({
      where: readyWhere,
      orderBy: { createdAt: 'asc' },
    });

    if (!candidate) return null;

    const claimed = await this.prisma.notificationJob.updateMany({
      where: {
        id: candidate.id,
        ...readyWhere,
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
    job: NotificationJob,
    input?: { provider?: string | null; providerMessageId?: string | null },
  ): Promise<void> {
    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        payloadJson: REDACTED_PAYLOAD_JSON,
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
        payloadJson: terminal ? REDACTED_PAYLOAD_JSON : undefined,
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

  async redactTerminalPayloads(): Promise<void> {
    await this.prisma.notificationJob.updateMany({
      where: {
        status: { in: ['sent', 'dead_letter'] },
        NOT: { payloadJson: REDACTED_PAYLOAD_JSON },
      },
      data: { payloadJson: REDACTED_PAYLOAD_JSON },
    });
  }

  async getDeadLetterDepth(): Promise<number> {
    return this.prisma.notificationJob.count({
      where: { status: 'dead_letter' },
    });
  }

  async getStatusSummary(): Promise<Record<string, number>> {
    const grouped = await this.prisma.notificationJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    return grouped.reduce<Record<string, number>>((summary, row) => {
      summary[row.status] = row._count._all;
      return summary;
    }, {});
  }

  async listRecentJobs(limit = 20): Promise<NotificationJob[]> {
    const jobs = await this.prisma.notificationJob.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return jobs.map((job) => this.mapJob(job));
  }

  private mapJob(job: {
    id: string;
    type: string;
    payloadJson: string;
    status: 'pending' | 'processing' | 'sent' | 'failed' | 'dead_letter';
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
      payload: this.decryptPayload(job.payloadJson),
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

  private encryptPayload(payload: OtpRequestedPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const envelope: EncryptedPayloadEnvelope = {
      v: 1,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    return JSON.stringify(envelope);
  }

  private decryptPayload(
    payloadJson: string,
  ): OtpRequestedPayload | RedactedOtpRequestedPayload {
    const stored = JSON.parse(payloadJson) as Record<string, unknown>;
    if (stored.redacted === true) {
      return { phone: '<redacted>', redacted: true };
    }

    if (this.isOtpPayload(stored)) {
      return stored;
    }

    if (!this.isEncryptedEnvelope(stored)) {
      throw new Error('Invalid notification payload');
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(stored.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(stored.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const payload = JSON.parse(plaintext) as Record<string, unknown>;
      if (!this.isOtpPayload(payload)) {
        throw new Error('Invalid decrypted notification payload');
      }
      return payload;
    } catch {
      throw new Error('Unable to decrypt notification payload');
    }
  }

  private encryptionKey(): Buffer {
    const secret = this.config.get<string>(
      'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY',
    );
    if (!secret) {
      throw new Error('Notification payload encryption key is not configured');
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }

  private isOtpPayload(
    value: Record<string, unknown>,
  ): value is Record<string, unknown> & OtpRequestedPayload {
    return typeof value.phone === 'string' && typeof value.otp === 'string';
  }

  private isEncryptedEnvelope(
    value: Record<string, unknown>,
  ): value is Record<string, unknown> & EncryptedPayloadEnvelope {
    return (
      value.v === 1 &&
      typeof value.iv === 'string' &&
      typeof value.authTag === 'string' &&
      typeof value.ciphertext === 'string'
    );
  }
}
