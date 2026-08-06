import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getDeviceReference } from './device-identity.util';

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
  deviceHash?: string;
  userAgent?: string;
  attemptNumber?: number;
  userId?: string;
  otpCodeId?: string;
  metadata?: Record<string, unknown>;
};

type CountRecentEventsInput = {
  types: AuthTelemetryEventType[];
  since: Date;
  ip?: string;
  phone?: string;
  deviceHash?: string;
};

const ABUSE_EVENT_TYPES: AuthTelemetryEventType[] = [
  'otp_request_rate_limited',
  'otp_resend_blocked',
  'otp_verify_failed',
  'otp_verify_locked',
];

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

@Injectable()
export class AuthTelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: RecordAuthEventInput): Promise<void> {
    await this.prisma.authEvent.create({
      data: {
        type: input.type,
        phone: input.phone,
        countryIso: input.countryIso,
        ip: input.ip || undefined,
        deviceHash: input.deviceHash || undefined,
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

  countRecentEvents(input: CountRecentEventsInput): Promise<number> {
    return this.prisma.authEvent.count({
      where: {
        type: { in: input.types },
        createdAt: { gte: input.since },
        ip: input.ip,
        phone: input.phone,
        deviceHash: input.deviceHash,
      },
    });
  }

  async getInspection(limit: number) {
    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    const generatedAt = new Date();
    const last15Minutes = new Date(generatedAt.getTime() - FIFTEEN_MINUTES_MS);
    const lastHour = new Date(generatedAt.getTime() - ONE_HOUR_MS);
    const last24Hours = new Date(generatedAt.getTime() - ONE_DAY_MS);
    const [
      summary,
      recentEvents,
      counts15Minutes,
      countsHour,
      counts24Hours,
      repeatedPhones,
      repeatedIps,
      repeatedDevices,
      otpRequests24Hours,
      otpRequestsWithDevice24Hours,
    ] = await Promise.all([
      this.prisma.authEvent.groupBy({
        by: ['type'],
        _count: { _all: true },
      }),
      this.prisma.authEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: boundedLimit,
      }),
      this.countByTypeSince(last15Minutes),
      this.countByTypeSince(lastHour),
      this.countByTypeSince(last24Hours),
      this.prisma.authEvent.groupBy({
        by: ['phone'],
        where: {
          createdAt: { gte: last24Hours },
          type: { in: ABUSE_EVENT_TYPES },
        },
        _count: { _all: true },
        orderBy: { _count: { phone: 'desc' } },
        take: 5,
      }),
      this.prisma.authEvent.groupBy({
        by: ['ip'],
        where: {
          createdAt: { gte: last24Hours },
          type: { in: ABUSE_EVENT_TYPES },
          ip: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { ip: 'desc' } },
        take: 5,
      }),
      this.prisma.authEvent.groupBy({
        by: ['deviceHash'],
        where: {
          createdAt: { gte: last24Hours },
          type: { in: ABUSE_EVENT_TYPES },
          deviceHash: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { deviceHash: 'desc' } },
        take: 5,
      }),
      this.prisma.authEvent.count({
        where: {
          type: 'otp_requested',
          createdAt: { gte: last24Hours },
        },
      }),
      this.prisma.authEvent.count({
        where: {
          type: 'otp_requested',
          createdAt: { gte: last24Hours },
          deviceHash: { not: null },
        },
      }),
    ]);

    return {
      summary: this.toTypeSummary(summary),
      diagnostics: {
        generatedAt,
        windows: {
          last15Minutes: this.toTypeSummary(counts15Minutes),
          lastHour: this.toTypeSummary(countsHour),
          last24Hours: this.toTypeSummary(counts24Hours),
        },
        deviceCoverageLast24Hours: {
          otpRequests: otpRequests24Hours,
          withDevice: otpRequestsWithDevice24Hours,
          percentage:
            otpRequests24Hours === 0
              ? 0
              : Math.round(
                  (otpRequestsWithDevice24Hours / otpRequests24Hours) * 100,
                ),
        },
        repeatedAbuseLast24Hours: {
          phones: repeatedPhones.map((row) => ({
            phone: this.maskPhone(row.phone),
            count: row._count._all,
          })),
          ips: repeatedIps.map((row) => ({
            ip: row.ip,
            count: row._count._all,
          })),
          devices: repeatedDevices.map((row) => ({
            deviceRef: getDeviceReference(row.deviceHash),
            count: row._count._all,
          })),
        },
      },
      recent: recentEvents.map((event) => ({
        id: event.id,
        type: event.type,
        phone: this.maskPhone(event.phone),
        countryIso: event.countryIso,
        ip: event.ip ?? null,
        deviceRef: getDeviceReference(event.deviceHash),
        userAgent: event.userAgent ?? null,
        attemptNumber: event.attemptNumber ?? null,
        userId: event.userId ?? null,
        otpCodeId: event.otpCodeId ?? null,
        metadata: this.parseMetadataJson(event.metadataJson),
        createdAt: event.createdAt,
      })),
    };
  }

  private countByTypeSince(since: Date) {
    return this.prisma.authEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
  }

  private toTypeSummary(
    rows: { type: AuthTelemetryEventType; _count: { _all: number } }[],
  ) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.type] = row._count._all;
      return acc;
    }, {});
  }

  private parseMetadataJson(
    metadataJson: string | null,
  ): Record<string, unknown> | null {
    if (!metadataJson) {
      return null;
    }
    try {
      return JSON.parse(metadataJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}
