import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuthTelemetryEventType =
  | 'otp_requested'
  | 'otp_request_rate_limited'
  | 'otp_resend_blocked'
  | 'otp_verify_failed'
  | 'otp_verify_locked'
  | 'otp_verify_succeeded';

type RecordAuthEventInput = {
  type: AuthTelemetryEventType;
  phone: string;
  countryIso: string;
  ip?: string;
  userAgent?: string;
  attemptNumber?: number;
  userId?: string;
  otpCodeId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuthTelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  recordEvent(input: RecordAuthEventInput): void {
    void this.prisma.authEvent.create({
      data: {
        type: input.type,
        phone: input.phone,
        countryIso: input.countryIso,
        ip: input.ip || undefined,
        userAgent: input.userAgent || undefined,
        attemptNumber: input.attemptNumber,
        userId: input.userId,
        otpCodeId: input.otpCodeId,
        metadataJson: input.metadata
          ? JSON.stringify(input.metadata)
          : undefined,
      },
    });
  }

  async getInspection(limit: number) {
    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    const [summary, recentEvents] = await Promise.all([
      this.prisma.authEvent.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.prisma.authEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: boundedLimit,
      }),
    ]);

    return {
      summary: summary.reduce<Record<string, number>>((acc, row) => {
        acc[row.type] = row._count._all;
        return acc;
      }, {}),
      recent: recentEvents.map((event) => ({
        id: event.id,
        type: event.type,
        phone: this.maskPhone(event.phone),
        countryIso: event.countryIso,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
        attemptNumber: event.attemptNumber ?? null,
        userId: event.userId ?? null,
        otpCodeId: event.otpCodeId ?? null,
        metadata: event.metadataJson
          ? (JSON.parse(event.metadataJson) as Record<string, unknown>)
          : null,
        createdAt: event.createdAt,
      })),
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}
