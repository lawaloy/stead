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
}
