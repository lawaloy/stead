import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    otpCode: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let notifications: { enqueueOtpRequested: jest.Mock };
  let jwt: { signAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      otpCode: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    notifications = {
      enqueueOtpRequested: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: NotificationsService,
          useValue: notifications,
        },
        {
          provide: JwtService,
          useValue: jwt,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    process.env.DEV_EXPOSE_OTP = 'false';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes phone numbers, stores metadata, and enqueues otp', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({ id: 'user_1', phone: '+2348012345678' });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_1' });

    await service.requestOtp('08012345678', 'NG', {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
      update: {},
      create: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          ip: '127.0.0.1',
          userAgent: 'jest-agent',
        }),
      }),
    );
    expect(notifications.enqueueOtpRequested).toHaveBeenCalledWith(
      '+2348012345678',
      expect.any(String),
    );
  });

  it('rejects otp resend during cooldown window', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({ id: 'user_1', phone: '+2348012345678' });
    prisma.otpCode.findFirst.mockResolvedValue({ id: 'otp_recent' });

    await expect(service.requestOtp('+2348012345678', 'NG')).rejects.toThrow(
      HttpException,
    );
    await expect(service.requestOtp('+2348012345678', 'NG')).rejects.toMatchObject({
      message: 'Please wait before requesting another OTP.',
    });
  });

  it('normalizes using the selected country', async () => {
    prisma.otpCode.count.mockResolvedValue(0);
    prisma.user.upsert.mockResolvedValue({ id: 'user_us', phone: '+14155552671' });
    prisma.otpCode.findFirst.mockResolvedValue(null);
    prisma.otpCode.create.mockResolvedValue({ id: 'otp_us' });

    await service.requestOtp('4155552671', 'US');

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: '+14155552671' },
      update: {},
      create: { phone: '+14155552671' },
    });
  });

  it('verifies otp against normalized phone and returns token', async () => {
    const otp = '123456';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      phone: '+2348012345678',
    });
    prisma.otpCode.findFirst.mockResolvedValue({
      id: 'otp_1',
      codeHash: await bcrypt.hash(otp, 1),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    prisma.otpCode.update.mockResolvedValue({});
    jwt.signAsync.mockResolvedValue('jwt_token');

    const result = await service.verifyOtp('08012345678', 'NG', otp);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+2348012345678' },
    });
    expect(prisma.otpCode.update).toHaveBeenCalledWith({
      where: { id: 'otp_1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(result).toEqual({ token: 'jwt_token' });
  });
});
