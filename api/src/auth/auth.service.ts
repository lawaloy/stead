import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
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
  OkResponse,
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../contracts/generated/types.gen';
import { hashDeviceIdentifier } from './device-identity.util';
import {
  generateRefreshFamilyId,
  generateRefreshToken,
  hashRefreshToken,
  parseDurationToMs,
  parseDurationToSeconds,
} from './refresh-token.util';
import { randomInt } from 'node:crypto';

const DEFAULT_OTP_REQUEST_LIMIT_PER_HOUR = 5;
const DEFAULT_OTP_RESEND_COOLDOWN_MS = 60_000;
const DEFAULT_OTP_MAX_VERIFY_ATTEMPTS = 5;
const DEFAULT_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR = 20;
const DEFAULT_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR = 5;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW = 10;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW = 8;
const DEFAULT_OTP_VERIFY_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_JWT_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '30d';
const DEFAULT_REFRESH_FAMILY_MAX_AGE = '90d';
const DEFAULT_REFRESH_MAX_FAMILIES_PER_USER = 5;
const OTP_LENGTH = 6;
const OTP_UPPER_BOUND = 10 ** OTP_LENGTH;

type OtpRequestContext = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

type SessionUser = {
  id: string;
  phone: string;
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
      userId: user.id,
      payload: { phone: normalizedPhone, otp },
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

    return this.issueSession(user, deviceHash);
  }

  async refreshSession(
    refreshToken: string,
    context: OtpRequestContext = {},
  ): Promise<VerifyOtpResponse> {
    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.revokeRefreshFamily(existing.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const familyMaxAgeMs = parseDurationToMs(this.refreshFamilyMaxAge);
    if (existing.familyCreatedAt.getTime() + familyMaxAgeMs <= Date.now()) {
      await this.revokeRefreshFamily(existing.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const deviceHash = hashDeviceIdentifier(
      context.deviceId,
      this.config.get<string>('AUTH_DEVICE_IDENTIFIER_SECRET'),
    );

    if (existing.deviceHash) {
      if (!deviceHash || deviceHash !== existing.deviceHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    }

    const created = await this.createRefreshTokenRow(
      existing.user.id,
      existing.familyId,
      deviceHash ?? existing.deviceHash,
      existing.familyCreatedAt,
    );

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedById: created.id,
      },
    });

    const token = await this.signAccessToken(existing.user);
    return {
      token,
      refreshToken: created.rawToken,
      expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn),
    };
  }

  async revokeSession(input: {
    refreshToken?: string;
    accessToken?: string;
    allDevices?: boolean;
  }): Promise<OkResponse> {
    if (input.allDevices) {
      const userId = await this.resolveUserIdForLogout(input);
      if (userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return { ok: true };
    }

    if (input.refreshToken) {
      const existing = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(input.refreshToken) },
      });
      if (existing) {
        await this.revokeRefreshFamily(existing.familyId);
      }
      return { ok: true };
    }

    if (input.accessToken) {
      // Access-only logout without allDevices is idempotent and does not
      // revoke other device families (refresh token identifies this device).
      try {
        const secret = this.config.get<string>('JWT_SECRET');
        if (secret) {
          await this.jwt.verifyAsync(input.accessToken, { secret });
        }
      } catch {
        // Invalid access tokens still return ok so logout is idempotent.
      }
      return { ok: true };
    }

    throw new UnauthorizedException('Missing session credential');
  }

  private async resolveUserIdForLogout(input: {
    refreshToken?: string;
    accessToken?: string;
  }): Promise<string | null> {
    if (input.accessToken) {
      try {
        const secret = this.config.get<string>('JWT_SECRET');
        if (!secret) return null;
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(
          input.accessToken,
          { secret },
        );
        if (payload.sub) return payload.sub;
      } catch {
        // Fall through to refresh token lookup.
      }
    }

    if (input.refreshToken) {
      const existing = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(input.refreshToken) },
        select: { userId: true },
      });
      return existing?.userId ?? null;
    }

    return null;
  }

  private get accessTokenExpiresIn() {
    return this.config.get<string>('JWT_EXPIRES_IN') || DEFAULT_JWT_EXPIRES_IN;
  }

  private get refreshTokenExpiresIn() {
    return (
      this.config.get<string>('AUTH_REFRESH_TOKEN_EXPIRES_IN') ||
      DEFAULT_REFRESH_TOKEN_EXPIRES_IN
    );
  }

  private get refreshFamilyMaxAge() {
    return (
      this.config.get<string>('AUTH_REFRESH_FAMILY_MAX_AGE') ||
      DEFAULT_REFRESH_FAMILY_MAX_AGE
    );
  }

  private get maxRefreshFamiliesPerUser() {
    const raw = this.config.get<number | string>(
      'AUTH_REFRESH_MAX_FAMILIES_PER_USER',
    );
    const parsed =
      typeof raw === 'number' ? raw : raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 1
      ? Math.floor(parsed)
      : DEFAULT_REFRESH_MAX_FAMILIES_PER_USER;
  }

  private async issueSession(
    user: SessionUser,
    deviceHash?: string | null,
    familyId = generateRefreshFamilyId(),
  ): Promise<VerifyOtpResponse> {
    await this.prepareRefreshFamilySlot(user.id, deviceHash);
    const created = await this.createRefreshTokenRow(
      user.id,
      familyId,
      deviceHash,
    );
    const token = await this.signAccessToken(user);
    return {
      token,
      refreshToken: created.rawToken,
      expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn),
    };
  }

  /**
   * Keeps concurrent live refresh families within AUTH_REFRESH_MAX_FAMILIES_PER_USER.
   * Re-OTP on the same device replaces that device's family; a new device at the
   * cap evicts the oldest family so sign-in still succeeds.
   */
  private async prepareRefreshFamilySlot(
    userId: string,
    deviceHash?: string | null,
  ) {
    if (deviceHash) {
      const sameDeviceFamilies = await this.prisma.refreshToken.findMany({
        where: { userId, deviceHash, revokedAt: null },
        distinct: ['familyId'],
        select: { familyId: true },
      });
      for (const row of sameDeviceFamilies) {
        await this.revokeRefreshFamily(row.familyId);
      }
    }

    const liveFamilies = await this.prisma.refreshToken.groupBy({
      by: ['familyId'],
      where: { userId, revokedAt: null },
      _min: { familyCreatedAt: true },
    });

    // Leave room for the family about to be issued.
    const overflow = liveFamilies.length - (this.maxRefreshFamiliesPerUser - 1);
    if (overflow <= 0) {
      return;
    }

    const oldestFirst = [...liveFamilies].sort(
      (a, b) =>
        (a._min.familyCreatedAt?.getTime() ?? 0) -
        (b._min.familyCreatedAt?.getTime() ?? 0),
    );
    for (let i = 0; i < overflow; i++) {
      await this.revokeRefreshFamily(oldestFirst[i].familyId);
    }
  }

  private async createRefreshTokenRow(
    userId: string,
    familyId: string,
    deviceHash?: string | null,
    familyCreatedAt: Date = new Date(),
  ) {
    const rawToken = generateRefreshToken();
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(rawToken),
        familyId,
        familyCreatedAt,
        deviceHash: deviceHash ?? null,
        expiresAt: new Date(
          Date.now() + parseDurationToMs(this.refreshTokenExpiresIn),
        ),
      },
    });
    return { id: row.id, rawToken };
  }

  private signAccessToken(user: SessionUser) {
    return this.jwt.signAsync(
      { sub: user.id, phone: user.phone },
      { expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn) },
    );
  }

  private revokeRefreshFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
