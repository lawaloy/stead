import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_PUBLISHER,
  type NotificationPublisher,
} from '../notifications/notification-publisher';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthTelemetryService } from './auth-telemetry.service';
import { CountryIso, normalizePhoneNumber } from './phone.util';
import { CountriesService } from '../countries/countries.service';
import type {
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../contracts/generated/types.gen';
import { hashDeviceIdentifier } from './device-identity.util';

const DEFAULT_OTP_REQUEST_LIMIT_PER_HOUR = 10;
const DEFAULT_OTP_RESEND_COOLDOWN_MS = 60_000;
const DEFAULT_OTP_MAX_VERIFY_ATTEMPTS = 5;
const DEFAULT_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR = 20;
const DEFAULT_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR = 10;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW = 10;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW = 8;
const DEFAULT_OTP_VERIFY_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_UPPER_BOUND = 10 ** OTP_LENGTH;

type OtpRequestContext = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

function generateOtp() {
  return randomInt(0, OTP_UPPER_BOUND).toString().padStart(OTP_LENGTH, '0');
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notificationPublisher: NotificationPublisher,
    private jwt: JwtService,
    private telemetry: AuthTelemetryService,
    private readonly config: ConfigService,
    private readonly countries: CountriesService,
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

  private get otpRequestLimitPerDevicePerHour() {
    return (
      this.config.get<number>('AUTH_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR') ??
      DEFAULT_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR
    );
  }

  private get otpVerifyFailureLimitPerIpWindow() {
    return (
      this.config.get<number>('AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW') ??
      DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW
    );
  }

  private get otpVerifyFailureLimitPerDeviceWindow() {
    return (
      this.config.get<number>(
        'AUTH_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW',
      ) ?? DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW
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
    countryIso: string,
    context: OtpRequestContext = {},
  ): Promise<RequestOtpResponse> {
    const country = await this.countries.requireAuthCountry(countryIso);
    const normalizedPhone = normalizePhoneNumber(
      phone,
      country.iso as CountryIso,
    );
    const deviceHash = hashDeviceIdentifier(
      context.deviceId,
      this.config.get<string>('AUTH_DEVICE_IDENTIFIER_SECRET'),
    );
    const eventContext = {
      ip: context.ip,
      userAgent: context.userAgent,
      deviceHash,
    };
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (context.ip) {
      const recentByIp = await this.telemetry.countRecentEvents({
        types: ['otp_requested'],
        since: oneHourAgo,
        ip: context.ip,
      });
      if (recentByIp >= this.otpRequestLimitPerIpPerHour) {
        await this.telemetry.recordEvent({
          type: 'otp_request_rate_limited',
          phone: normalizedPhone,
          countryIso: country.iso,
          ...eventContext,
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

    if (deviceHash) {
      const recentByDevice = await this.telemetry.countRecentEvents({
        types: ['otp_requested'],
        since: oneHourAgo,
        deviceHash,
      });
      if (recentByDevice >= this.otpRequestLimitPerDevicePerHour) {
        await this.telemetry.recordEvent({
          type: 'otp_request_rate_limited',
          phone: normalizedPhone,
          countryIso: country.iso,
          ...eventContext,
          metadata: {
            limit: this.otpRequestLimitPerDevicePerHour,
            window: '1h',
            scope: 'device',
          },
        });
        throw new HttpException(
          'Too many OTP requests from this device. Try again later.',
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
      await this.telemetry.recordEvent({
        type: 'otp_request_rate_limited',
        phone: normalizedPhone,
        countryIso: country.iso,
        ...eventContext,
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
      await this.telemetry.recordEvent({
        type: 'otp_resend_blocked',
        phone: normalizedPhone,
        countryIso: country.iso,
        ...eventContext,
        userId: user.id,
        otpCodeId: latestOtp.id,
        metadata: { cooldownMs: this.otpResendCooldownMs },
      });
      throw new HttpException(
        'Please wait before requesting another OTP.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = generateOtp();
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

    await this.telemetry.recordEvent({
      type: 'otp_requested',
      phone: normalizedPhone,
      countryIso: country.iso,
      ...eventContext,
      userId: user.id,
    });

    await this.notificationPublisher.publishOtpRequested({
      phone: normalizedPhone,
      otp,
    });

    if (this.config.get<string>('DEV_EXPOSE_OTP') === 'true') {
      return { ok: true, otp };
    }

    return { ok: true };
  }

  async verifyOtp(
    phone: string,
    countryIso: string,
    otp: string,
    context: OtpRequestContext = {},
  ): Promise<VerifyOtpResponse> {
    const country = await this.countries.requireAuthCountry(countryIso);
    const normalizedPhone = normalizePhoneNumber(
      phone,
      country.iso as CountryIso,
    );
    const deviceHash = hashDeviceIdentifier(
      context.deviceId,
      this.config.get<string>('AUTH_DEVICE_IDENTIFIER_SECRET'),
    );
    const eventContext = {
      ip: context.ip,
      userAgent: context.userAgent,
      deviceHash,
    };
    if (context.ip) {
      const recentVerifyFailuresByIp = await this.telemetry.countRecentEvents({
        types: ['otp_verify_failed', 'otp_verify_locked'],
        since: new Date(Date.now() - this.otpVerifyFailureWindowMs),
        ip: context.ip,
      });

      if (recentVerifyFailuresByIp >= this.otpVerifyFailureLimitPerIpWindow) {
        await this.telemetry.recordEvent({
          type: 'otp_verify_locked',
          phone: normalizedPhone,
          countryIso: country.iso,
          ...eventContext,
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

    if (deviceHash) {
      const recentVerifyFailuresByDevice =
        await this.telemetry.countRecentEvents({
          types: ['otp_verify_failed', 'otp_verify_locked'],
          since: new Date(Date.now() - this.otpVerifyFailureWindowMs),
          deviceHash,
        });

      if (
        recentVerifyFailuresByDevice >=
        this.otpVerifyFailureLimitPerDeviceWindow
      ) {
        await this.telemetry.recordEvent({
          type: 'otp_verify_locked',
          phone: normalizedPhone,
          countryIso: country.iso,
          ...eventContext,
          attemptNumber: recentVerifyFailuresByDevice,
          metadata: {
            reason: 'device_window_limit_reached',
            limit: this.otpVerifyFailureLimitPerDeviceWindow,
            windowMs: this.otpVerifyFailureWindowMs,
          },
        });
        throw new HttpException(
          'Too many invalid OTP attempts from this device. Try again later.',
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
      await this.telemetry.recordEvent({
        type: 'otp_verify_locked',
        phone: normalizedPhone,
        countryIso: country.iso,
        ...eventContext,
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
      const locked = verifyAttempts >= this.otpMaxVerifyAttempts;
      const lockConsumedAt = locked ? new Date() : undefined;
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: {
          verifyAttempts,
          consumedAt: lockConsumedAt,
        },
      });

      if (locked && lockConsumedAt) {
        // Locking the latest row would otherwise leave an older unconsumed
        // SMS selectable by findFirst and able to mint a session.
        await this.retireLiveOtpsForUser(user.id, lockConsumedAt);
        await this.telemetry.recordEvent({
          type: 'otp_verify_locked',
          phone: normalizedPhone,
          countryIso: country.iso,
          ...eventContext,
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

      await this.telemetry.recordEvent({
        type: 'otp_verify_failed',
        phone: normalizedPhone,
        countryIso: country.iso,
        ...eventContext,
        userId: user.id,
        otpCodeId: record.id,
        attemptNumber: verifyAttempts,
      });
      throw new BadRequestException('Invalid phone or code');
    }

    const consumedAt = new Date();
    const consumed = await this.prisma.otpCode.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('OTP expired or not found');
    }

    // A newer successful verify must retire every other live code for this
    // user. Otherwise the previous SMS still matches findFirst after this
    // row is consumed and issues a second session.
    await this.retireLiveOtpsForUser(user.id, consumedAt);

    await this.telemetry.recordEvent({
      type: 'otp_verify_succeeded',
      phone: normalizedPhone,
      countryIso: country.iso,
      ...eventContext,
      userId: user.id,
      otpCodeId: record.id,
      attemptNumber: record.verifyAttempts,
    });

    const token = await this.jwt.signAsync({ sub: user.id, phone: user.phone });
    return { token };
  }

  private retireLiveOtpsForUser(userId: string, consumedAt: Date) {
    return this.prisma.otpCode.updateMany({
      where: {
        userId,
        consumedAt: null,
      },
      data: { consumedAt },
    });
  }
}
