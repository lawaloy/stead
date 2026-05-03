import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthTelemetryService } from './auth-telemetry.service';
import { CountryIso, normalizePhoneNumber } from './phone.util';

const DEFAULT_OTP_REQUEST_LIMIT_PER_HOUR = 10;
const DEFAULT_OTP_RESEND_COOLDOWN_MS = 60_000;
const DEFAULT_OTP_MAX_VERIFY_ATTEMPTS = 5;
const DEFAULT_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR = 20;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW = 10;
const DEFAULT_OTP_VERIFY_FAILURE_WINDOW_MS = 15 * 60 * 1000;

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
    private readonly config: ConfigService,
  ) {}

  private get otpRequestLimitPerHour() {
    return (
      this.config.get<number>('AUTH_OTP_REQUEST_LIMIT_PER_HOUR') ??
      DEFAULT_OTP_REQUEST_LIMIT_PER_HOUR
    );
  }

  private get otpResendCooldownMs() {
    return (
      this.config.get<number>('AUTH_OTP_RESEND_COOLDOWN_MS') ??
      DEFAULT_OTP_RESEND_COOLDOWN_MS
    );
  }

  private get otpMaxVerifyAttempts() {
    return (
      this.config.get<number>('AUTH_OTP_MAX_VERIFY_ATTEMPTS') ??
      DEFAULT_OTP_MAX_VERIFY_ATTEMPTS
    );
  }

  private get otpRequestLimitPerIpPerHour() {
    return (
      this.config.get<number>('AUTH_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR') ??
      DEFAULT_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR
    );
  }

  private get otpVerifyFailureLimitPerIpWindow() {
    return (
      this.config.get<number>('AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW') ??
      DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW
    );
  }

  private get otpVerifyFailureWindowMs() {
    return (
      this.config.get<number>('AUTH_OTP_VERIFY_FAILURE_WINDOW_MS') ??
      DEFAULT_OTP_VERIFY_FAILURE_WINDOW_MS
    );
  }

  async requestOtp(
    phone: string,
    countryIso: CountryIso,
    context: OtpRequestContext = {},
  ) {
    const normalizedPhone = normalizePhoneNumber(phone, countryIso);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (context.ip) {
      const recentByIp = await this.telemetry.countRecentEvents({
        types: ['otp_requested'],
        since: oneHourAgo,
        ip: context.ip,
      });
      if (recentByIp >= this.otpRequestLimitPerIpPerHour) {
        this.telemetry.recordEvent({
          type: 'otp_request_rate_limited',
          phone: normalizedPhone,
          countryIso,
          ip: context.ip,
          userAgent: context.userAgent,
          metadata: {
            limit: this.otpRequestLimitPerIpPerHour,
            window: '1h',
            scope: 'ip',
          },
        });
        throw new HttpException(
          'Too many OTP requests from this network. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const recent = await this.prisma.otpCode.count({
      where: {
        user: { phone: normalizedPhone },
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recent >= this.otpRequestLimitPerHour) {
      this.telemetry.recordEvent({
        type: 'otp_request_rate_limited',
        phone: normalizedPhone,
        countryIso,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { limit: this.otpRequestLimitPerHour, window: '1h' },
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
        createdAt: { gt: new Date(Date.now() - this.otpResendCooldownMs) },
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
        metadata: { cooldownMs: this.otpResendCooldownMs },
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
    if (context.ip) {
      const recentVerifyFailuresByIp = await this.telemetry.countRecentEvents({
        types: ['otp_verify_failed', 'otp_verify_locked'],
        since: new Date(Date.now() - this.otpVerifyFailureWindowMs),
        ip: context.ip,
      });

      if (recentVerifyFailuresByIp >= this.otpVerifyFailureLimitPerIpWindow) {
        this.telemetry.recordEvent({
          type: 'otp_verify_locked',
          phone: normalizedPhone,
          countryIso,
          ip: context.ip,
          userAgent: context.userAgent,
          attemptNumber: recentVerifyFailuresByIp,
          metadata: {
            reason: 'ip_window_limit_reached',
            limit: this.otpVerifyFailureLimitPerIpWindow,
            windowMs: this.otpVerifyFailureWindowMs,
          },
        });
        throw new HttpException(
          'Too many invalid OTP attempts from this network. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

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

    if (record.verifyAttempts >= this.otpMaxVerifyAttempts) {
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
            verifyAttempts >= this.otpMaxVerifyAttempts
              ? new Date()
              : undefined,
        },
      });

      if (verifyAttempts >= this.otpMaxVerifyAttempts) {
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

    const consumed = await this.prisma.otpCode.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('OTP expired or not found');
    }

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
