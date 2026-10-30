import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
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
import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  decryptOtpVerificationResponse,
  encryptOtpVerificationResponse,
  hashOtpVerificationKey,
  hashOtpVerificationRequest,
  otpVerificationRequestMatches,
} from './otp-verification-idempotency';

const DEFAULT_OTP_REQUEST_LIMIT_PER_HOUR = 5;
const DEFAULT_OTP_RESEND_COOLDOWN_MS = 60_000;
const DEFAULT_OTP_MAX_VERIFY_ATTEMPTS = 5;
const DEFAULT_OTP_REQUEST_LIMIT_PER_IP_PER_HOUR = 20;
const DEFAULT_OTP_REQUEST_LIMIT_PER_DEVICE_PER_HOUR = 5;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_IP_WINDOW = 10;
const DEFAULT_OTP_VERIFY_FAILURE_LIMIT_PER_DEVICE_WINDOW = 8;
const DEFAULT_OTP_VERIFY_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const OTP_REQUEST_PROCESSING_TIMEOUT_MS = 30_000;
const OTP_VERIFICATION_REPLAY_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_JWT_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '30d';
const DEFAULT_REFRESH_FAMILY_MAX_AGE = '90d';
const DEFAULT_REFRESH_MAX_FAMILIES_PER_USER = 5;
const OTP_LENGTH = 6;
const OTP_UPPER_BOUND = 10 ** OTP_LENGTH;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthRequestContext = {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
};

type OtpRequestContext = AuthRequestContext & {
  idempotencyKey: string;
};

type OtpVerificationContext = AuthRequestContext & {
  idempotencyKey?: string;
};

type SessionUser = {
  id: string;
  phone: string;
};

function generateOtp() {
  return randomInt(0, OTP_UPPER_BOUND).toString().padStart(OTP_LENGTH, '0');
}

function otpNotificationDedupeKey(requestKeyHash: string) {
  return `otp.requested:${requestKeyHash}`;
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

  private buildOtpRequestResponse(
    developmentOtp?: string | null,
  ): RequestOtpResponse {
    if (
      this.config.get<string>('DEV_EXPOSE_OTP') === 'true' &&
      developmentOtp
    ) {
      return { ok: true, otp: developmentOtp };
    }

    return { ok: true };
  }

  private async replayOtpRequest(
    requestKeyHash: string,
    normalizedPhone: string,
  ): Promise<RequestOtpResponse | null> {
    const existing = await this.prisma.otpCode.findUnique({
      where: { requestKeyHash },
      include: { user: { select: { phone: true } } },
    });
    if (!existing) return null;

    if (existing.user.phone !== normalizedPhone) {
      throw new ConflictException(
        'Idempotency-Key was already used for another OTP request.',
      );
    }

    if (!existing.requestCompletedAt) {
      const notificationDedupeKey = otpNotificationDedupeKey(requestKeyHash);
      if (
        (await this.notificationPublisher.isOtpRequestEnqueued(
          notificationDedupeKey,
          existing.id,
        )) ||
        (await this.notificationPublisher.adoptLegacyOtpRequest({
          userId: existing.userId,
          otpCodeId: existing.id,
          dedupeKey: notificationDedupeKey,
          requestedAt: existing.createdAt,
          expiresAt: existing.expiresAt,
        }))
      ) {
        await this.prisma.otpCode.update({
          where: { id: existing.id },
          data: { requestCompletedAt: new Date() },
        });
        return this.buildOtpRequestResponse(existing.developmentOtp);
      }

      const processingDeadline = new Date(
        Date.now() - OTP_REQUEST_PROCESSING_TIMEOUT_MS,
      );
      if (existing.createdAt <= processingDeadline) {
        try {
          const removed = await this.prisma.otpCode.deleteMany({
            where: {
              id: existing.id,
              requestCompletedAt: null,
              createdAt: { lte: processingDeadline },
            },
          });
          if (removed.count === 1) return null;
        } catch (error: unknown) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'P2003' &&
            (await this.notificationPublisher.isOtpRequestEnqueued(
              notificationDedupeKey,
              existing.id,
            ))
          ) {
            await this.prisma.otpCode.update({
              where: { id: existing.id },
              data: { requestCompletedAt: new Date() },
            });
            return this.buildOtpRequestResponse(existing.developmentOtp);
          }
          throw error;
        }
      }

      throw new HttpException(
        'The matching OTP request is still processing. Retry shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.buildOtpRequestResponse(existing.developmentOtp);
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
    context: OtpRequestContext,
  ): Promise<RequestOtpResponse> {
    const country = await this.countries.requireAuthCountry(countryIso);
    const normalizedPhone = normalizePhoneNumber(
      phone,
      country.iso as CountryIso,
    );
    const idempotencyKey = context.idempotencyKey.trim().toLowerCase();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUIDv4 value.');
    }
    const requestKeyHash = createHash('sha256')
      .update(idempotencyKey)
      .digest('hex');
    const replay = await this.replayOtpRequest(requestKeyHash, normalizedPhone);
    if (replay) return replay;
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
      if (
        latestOtp.requestKeyHash === requestKeyHash &&
        latestOtp.requestCompletedAt
      ) {
        return this.buildOtpRequestResponse(latestOtp.developmentOtp);
      }
      if (latestOtp.requestKeyHash === requestKeyHash) {
        throw new HttpException(
          'The matching OTP request is still processing. Retry shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

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
    const developmentOtp =
      this.config.get<string>('DEV_EXPOSE_OTP') === 'true' ? otp : undefined;

    let otpCodeId: string;
    try {
      const created = await this.prisma.otpCode.create({
        data: {
          userId: user.id,
          codeHash,
          requestKeyHash,
          developmentOtp,
          expiresAt,
          ip: context.ip || undefined,
          userAgent: context.userAgent || undefined,
        },
      });
      otpCodeId = created.id;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const replay = await this.replayOtpRequest(
          requestKeyHash,
          normalizedPhone,
        );
        if (replay) return replay;
      }
      throw error;
    }

    const notificationDedupeKey = otpNotificationDedupeKey(requestKeyHash);
    try {
      await this.telemetry.recordEvent({
        type: 'otp_requested',
        phone: normalizedPhone,
        countryIso: country.iso,
        ...eventContext,
        userId: user.id,
        otpCodeId,
      });
    } catch (error: unknown) {
      await this.prisma.otpCode
        .deleteMany({ where: { id: otpCodeId, requestCompletedAt: null } })
        .catch(() => undefined);
      throw error;
    }

    await this.notificationPublisher.publishOtpRequested({
      userId: user.id,
      otpCodeId,
      dedupeKey: notificationDedupeKey,
      payload: { phone: normalizedPhone, otp },
    });

    await this.prisma.otpCode.update({
      where: { id: otpCodeId },
      data: { requestCompletedAt: new Date() },
    });

    return this.buildOtpRequestResponse(developmentOtp);
  }

  async verifyOtp(
    phone: string,
    countryIso: string,
    otp: string,
    context: OtpVerificationContext = {},
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
    const idempotencyKey = (context.idempotencyKey ?? randomUUID())
      .trim()
      .toLowerCase();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUIDv4 value.');
    }
    const verificationSecret = this.otpVerificationEncryptionKey;
    const verificationKeyHash = hashOtpVerificationKey(idempotencyKey);
    const verificationRequestHash = hashOtpVerificationRequest(
      verificationSecret,
      {
        phone: normalizedPhone,
        countryIso: country.iso,
        otp,
        deviceHash,
      },
    );
    const replay = await this.replayOtpVerification(
      verificationSecret,
      verificationKeyHash,
      verificationRequestHash,
    );
    if (replay) return replay;
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
    if (!record) {
      // The winning verification can commit after our initial replay lookup
      // but before this live-code query. Recheck the key before reporting an
      // expired OTP so a concurrent retry still receives the stored result.
      const concurrentReplay = await this.replayOtpVerification(
        verificationSecret,
        verificationKeyHash,
        verificationRequestHash,
      );
      if (concurrentReplay) return concurrentReplay;
      throw new BadRequestException('OTP expired or not found');
    }

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

    return this.issueVerifiedSession({
      user,
      record,
      normalizedPhone,
      countryIso: country.iso,
      eventContext,
      deviceHash,
      verificationSecret,
      verificationKeyHash,
      verificationRequestHash,
    });
  }

  async refreshSession(
    refreshToken: string,
    context: AuthRequestContext = {},
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
      await this.revokeRefreshFamily(existing.familyId, existing.userId);
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
      await this.revokeRefreshFamily(existing.familyId, existing.userId);
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

    const session = await this.prisma.$transaction(async (transaction) => {
      await this.lockRefreshUser(transaction, existing.userId);
      const now = new Date();
      // The conditional write also locks the predecessor until commit. A
      // concurrent refresh waits, then observes that it has already been used.
      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          expiresAt: { gt: now },
          familyCreatedAt: {
            gt: new Date(now.getTime() - familyMaxAgeMs),
          },
        },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) return null;

      const created = await this.createRefreshTokenRow(
        existing.user.id,
        existing.familyId,
        deviceHash ?? existing.deviceHash,
        existing.familyCreatedAt,
        transaction,
      );
      await transaction.refreshToken.update({
        where: { id: existing.id },
        data: { replacedById: created.id },
      });

      // Signing failures must roll back rotation too, so the caller can retry
      // its original credential rather than losing access to the new token.
      const token = await this.signAccessToken(existing.user);
      return {
        token,
        refreshToken: created.rawToken,
        expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn),
      };
    });

    if (!session) {
      const current = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
      });
      if (current?.revokedAt) {
        // Persist reuse revocation outside the failed rotation transaction.
        await this.revokeRefreshFamily(existing.familyId, existing.userId);
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
    return session;
  }

  async revokeSession(input: {
    refreshToken?: string;
    accessToken?: string;
    allDevices?: boolean;
  }): Promise<OkResponse> {
    if (input.allDevices) {
      const userId = await this.resolveUserIdForLogout(input);
      if (userId) {
        await this.revokeRefreshTokens(userId, { userId });
      }
      return { ok: true };
    }

    if (input.refreshToken) {
      const existing = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(input.refreshToken) },
      });
      if (existing) {
        await this.revokeRefreshFamily(existing.familyId, existing.userId);
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

  private get otpVerificationEncryptionKey() {
    const secret =
      this.config.get<string>('AUTH_OTP_VERIFICATION_ENCRYPTION_KEY') ??
      process.env.AUTH_OTP_VERIFICATION_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error('OTP verification encryption key is not configured');
    }
    return secret;
  }

  private async replayOtpVerification(
    secret: string,
    verificationKeyHash: string,
    verificationRequestHash: string,
  ): Promise<VerifyOtpResponse | null> {
    const existing = await this.prisma.otpCode.findUnique({
      where: { verificationKeyHash },
      select: {
        verificationRequestHash: true,
        verificationResponseJson: true,
        verifiedAt: true,
      },
    });
    if (!existing) return null;
    if (
      !existing.verificationRequestHash ||
      !otpVerificationRequestMatches(
        existing.verificationRequestHash,
        verificationRequestHash,
      )
    ) {
      throw new ConflictException(
        'Idempotency-Key was already used for another OTP verification.',
      );
    }
    if (
      !existing.verifiedAt ||
      !existing.verificationResponseJson ||
      Date.now() - existing.verifiedAt.getTime() >
        OTP_VERIFICATION_REPLAY_WINDOW_MS
    ) {
      throw new ConflictException(
        'The OTP verification replay window has expired.',
      );
    }
    return decryptOtpVerificationResponse(
      secret,
      verificationKeyHash,
      verificationRequestHash,
      existing.verificationResponseJson,
    );
  }

  private async issueVerifiedSession(input: {
    user: SessionUser;
    record: { id: string; verifyAttempts: number };
    normalizedPhone: string;
    countryIso: string;
    eventContext: {
      ip?: string;
      userAgent?: string;
      deviceHash?: string | null;
    };
    deviceHash?: string | null;
    verificationSecret: string;
    verificationKeyHash: string;
    verificationRequestHash: string;
  }): Promise<VerifyOtpResponse> {
    const familyId = generateRefreshFamilyId();
    const familyCreatedAt = new Date();
    const rawRefreshToken = generateRefreshToken();
    const consumedAt = new Date();
    let response: VerifyOtpResponse | undefined;

    try {
      await this.prisma.$transaction(async (transaction) => {
        const consumed = await transaction.otpCode.updateMany({
          where: {
            id: input.record.id,
            consumedAt: null,
            expiresAt: { gt: consumedAt },
          },
          data: { consumedAt },
        });
        if (consumed.count === 0) {
          throw new BadRequestException('OTP expired or not found');
        }

        await transaction.otpCode.updateMany({
          where: { userId: input.user.id, consumedAt: null },
          data: { consumedAt },
        });
        await this.telemetry.recordEvent(
          {
            type: 'otp_verify_succeeded',
            phone: input.normalizedPhone,
            countryIso: input.countryIso,
            ip: input.eventContext.ip,
            deviceHash: input.eventContext.deviceHash ?? undefined,
            userAgent: input.eventContext.userAgent,
            userId: input.user.id,
            otpCodeId: input.record.id,
            attemptNumber: input.record.verifyAttempts,
          },
          transaction,
        );

        await this.lockRefreshUser(transaction, input.user.id);
        await this.prepareRefreshFamilySlot(
          transaction,
          input.user.id,
          input.deviceHash,
        );
        await this.createRefreshTokenRow(
          input.user.id,
          familyId,
          input.deviceHash,
          familyCreatedAt,
          transaction,
          rawRefreshToken,
        );
        response = {
          token: await this.signAccessToken(input.user),
          refreshToken: rawRefreshToken,
          expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn),
        };
        await transaction.otpCode.update({
          where: { id: input.record.id },
          data: {
            verificationKeyHash: input.verificationKeyHash,
            verificationRequestHash: input.verificationRequestHash,
            verificationResponseJson: encryptOtpVerificationResponse(
              input.verificationSecret,
              input.verificationKeyHash,
              input.verificationRequestHash,
              response,
            ),
            verifiedAt: consumedAt,
          },
        });
      });
      if (!response) {
        throw new Error('OTP verification transaction returned no response');
      }
      return response;
    } catch (error: unknown) {
      const replay = await this.replayOtpVerification(
        input.verificationSecret,
        input.verificationKeyHash,
        input.verificationRequestHash,
      );
      if (replay) return replay;
      throw error;
    }
  }

  private async issueSession(
    user: SessionUser,
    deviceHash?: string | null,
    familyId = generateRefreshFamilyId(),
  ): Promise<VerifyOtpResponse> {
    const rawRefreshToken = generateRefreshToken();
    await this.prisma.$transaction(async (transaction) => {
      await this.lockRefreshUser(transaction, user.id);
      await this.prepareRefreshFamilySlot(transaction, user.id, deviceHash);
      await this.createRefreshTokenRow(
        user.id,
        familyId,
        deviceHash,
        new Date(),
        transaction,
        rawRefreshToken,
      );
    });
    return {
      token: await this.signAccessToken(user),
      refreshToken: rawRefreshToken,
      expiresIn: parseDurationToSeconds(this.accessTokenExpiresIn),
    };
  }

  /**
   * Keeps concurrent live refresh families within AUTH_REFRESH_MAX_FAMILIES_PER_USER.
   * Re-OTP on the same device replaces that device's family; a new device at the
   * cap evicts the oldest family so sign-in still succeeds.
   */
  private async prepareRefreshFamilySlot(
    transaction: Prisma.TransactionClient,
    userId: string,
    deviceHash?: string | null,
  ) {
    if (deviceHash) {
      const sameDeviceFamilies = await transaction.refreshToken.findMany({
        where: { userId, deviceHash, revokedAt: null },
        distinct: ['familyId'],
        select: { familyId: true },
      });
      for (const row of sameDeviceFamilies) {
        await transaction.refreshToken.updateMany({
          where: { familyId: row.familyId, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    const liveFamilies = await transaction.refreshToken.groupBy({
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
      await transaction.refreshToken.updateMany({
        where: {
          familyId: oldestFirst[i].familyId,
          userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async createRefreshTokenRow(
    userId: string,
    familyId: string,
    deviceHash?: string | null,
    familyCreatedAt: Date = new Date(),
    client: Pick<Prisma.TransactionClient, 'refreshToken'> = this.prisma,
    rawToken = generateRefreshToken(),
  ) {
    const row = await client.refreshToken.create({
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

  private async lockRefreshUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    // Every rotation and revocation takes this stable lock before touching
    // refresh rows. Revocation's subsequent statement can then see a successor
    // committed by a rotation that held the lock first.
    const lockKey = createHash('sha256')
      .update(`stead:refresh-user:${userId}`)
      .digest()
      .readBigInt64BE();
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(${lockKey}::bigint)
    `;
  }

  private revokeRefreshTokens(
    userId: string,
    where: Prisma.RefreshTokenWhereInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockRefreshUser(transaction, userId);
      return transaction.refreshToken.updateMany({
        where: { ...where, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private revokeRefreshFamily(familyId: string, userId: string) {
    return this.revokeRefreshTokens(userId, { familyId });
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
