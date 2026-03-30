import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthTelemetryService } from './auth-telemetry.service';
import { CountryIso, normalizePhoneNumber } from './phone.util';

const OTP_REQUEST_LIMIT_PER_HOUR = 10;
const OTP_RESEND_COOLDOWN_MS = 60_000;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

type OtpRequestContext = {
  ip?: string;
  userAgent?: string;
};

function randomOtp(len = 6) {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++)
    out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private jwt: JwtService,
    private telemetry: AuthTelemetryService,
  ) {}

  async requestOtp(
    phone: string,
    countryIso: CountryIso,
    context: OtpRequestContext = {},
  ) {
    const normalizedPhone = normalizePhoneNumber(phone, countryIso);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpCode.count({
      where: {
        user: { phone: normalizedPhone },
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recent >= OTP_REQUEST_LIMIT_PER_HOUR) {
      this.telemetry.recordEvent({
        type: 'otp_request_rate_limited',
        phone: normalizedPhone,
        countryIso,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { limit: OTP_REQUEST_LIMIT_PER_HOUR, window: '1h' },
      });
      throw new HttpException(
        'Too many OTP requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.upsert({
      where: { phone: normalizedPhone },
      update: {},
      create: { phone: normalizedPhone },
    });

    const latestOtp = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (latestOtp) {
      this.telemetry.recordEvent({
        type: 'otp_resend_blocked',
        phone: normalizedPhone,
        countryIso,
        ip: context.ip,
        userAgent: context.userAgent,
        userId: user.id,
        otpCodeId: latestOtp.id,
        metadata: { cooldownMs: OTP_RESEND_COOLDOWN_MS },
      });
      throw new HttpException(
        'Please wait before requesting another OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = randomOtp(6);
    const codeHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
        ip: context.ip || undefined,
        userAgent: context.userAgent || undefined,
      },
    });

    this.telemetry.recordEvent({
      type: 'otp_requested',
      phone: normalizedPhone,
      countryIso,
      ip: context.ip,
      userAgent: context.userAgent,
      userId: user.id,
    });

    if (process.env.DEV_EXPOSE_OTP === 'true') {
      return { ok: true, otp };
    }

    this.notifications.enqueueOtpRequested(normalizedPhone, otp);

    return { ok: true };
  }

  async verifyOtp(
    phone: string,
    countryIso: CountryIso,
    otp: string,
    context: OtpRequestContext = {},
  ) {
    const normalizedPhone = normalizePhoneNumber(phone, countryIso);
    const user = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (!user) throw new BadRequestException('Invalid phone or code');

    const record = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('OTP expired or not found');

    if (record.verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      this.telemetry.recordEvent({
        type: 'otp_verify_locked',
        phone: normalizedPhone,
        countryIso,
        ip: context.ip,
        userAgent: context.userAgent,
        userId: user.id,
        otpCodeId: record.id,
        attemptNumber: record.verifyAttempts,
        metadata: { reason: 'already_locked' },
      });
      throw new HttpException(
        'Too many invalid OTP attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await bcrypt.compare(otp, record.codeHash);
    if (!ok) {
      const verifyAttempts = record.verifyAttempts + 1;
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: {
          verifyAttempts,
          consumedAt:
            verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS ? new Date() : undefined,
        },
      });

      if (verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        this.telemetry.recordEvent({
          type: 'otp_verify_locked',
          phone: normalizedPhone,
          countryIso,
          ip: context.ip,
          userAgent: context.userAgent,
          userId: user.id,
          otpCodeId: record.id,
          attemptNumber: verifyAttempts,
          metadata: { reason: 'max_attempts_reached' },
        });
        throw new HttpException(
          'Too many invalid OTP attempts. Request a new code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      this.telemetry.recordEvent({
        type: 'otp_verify_failed',
        phone: normalizedPhone,
        countryIso,
        ip: context.ip,
        userAgent: context.userAgent,
        userId: user.id,
        otpCodeId: record.id,
        attemptNumber: verifyAttempts,
      });
      throw new BadRequestException('Invalid phone or code');
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    this.telemetry.recordEvent({
      type: 'otp_verify_succeeded',
      phone: normalizedPhone,
      countryIso,
      ip: context.ip,
      userAgent: context.userAgent,
      userId: user.id,
      otpCodeId: record.id,
      attemptNumber: record.verifyAttempts,
    });

    const token = await this.jwt.signAsync({ sub: user.id, phone: user.phone });
    return { token };
  }
}
