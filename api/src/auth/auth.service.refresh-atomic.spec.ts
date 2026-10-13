import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { CountriesService } from '../countries/countries.service';
import type { NotificationPublisher } from '../notifications/notification-publisher';
import { hashRefreshToken } from './refresh-token.util';

describe('AuthService atomic refresh rotation', () => {
  const rawToken = 'original-refresh-token';
  let service: AuthService;
  let transaction: {
    refreshToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwt: { signAsync: jest.Mock };

  beforeEach(() => {
    transaction = {
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'replacement' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'original',
          familyId: 'family',
          familyCreatedAt: new Date(Date.now() - 60_000),
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          deviceHash: null,
          user: { id: 'user', phone: '+2348012345678' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as NotificationPublisher,
      jwt as unknown as JwtService,
      {} as AuthTelemetryService,
      new ConfigService({}),
      {} as CountriesService,
    );
  });

  it('uses the transaction client for every rotation write', async () => {
    const session = await service.refreshSession(rawToken);

    expect(session.token).toBe('access-token');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'original',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as unknown },
        familyCreatedAt: { gt: expect.any(Date) as unknown },
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });
    expect(transaction.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user',
        familyId: 'family',
        tokenHash: hashRefreshToken(session.refreshToken),
      }) as unknown,
    });
    expect(transaction.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'original' },
      data: { replacedById: 'replacement' },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a lost claim and revokes the family after the transaction completes', async () => {
    transaction.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      id: 'original',
      familyId: 'family',
      familyCreatedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      deviceHash: null,
      user: { id: 'user', phone: '+2348012345678' },
    });
    prisma.refreshToken.findUnique.mockResolvedValue({ revokedAt: new Date() });

    await expect(service.refreshSession(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(transaction.refreshToken.create).not.toHaveBeenCalled();
    expect(transaction.refreshToken.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(prisma.refreshToken.findUnique).toHaveBeenLastCalledWith({
      where: { tokenHash: hashRefreshToken(rawToken) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family', revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it.each([null, { revokedAt: null }])(
    'does not treat deletion or expiry during the claim as token reuse: %p',
    async (current) => {
      transaction.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'original',
        familyId: 'family',
        familyCreatedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        deviceHash: null,
        user: { id: 'user', phone: '+2348012345678' },
      });
      prisma.refreshToken.findUnique.mockResolvedValue(current);

      await expect(service.refreshSession(rawToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(transaction.refreshToken.create).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    },
  );

  it('does not return credentials when committing the rotation fails', async () => {
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof transaction) => Promise<unknown>) => {
        await operation(transaction);
        throw new Error('commit failed');
      },
    );

    await expect(service.refreshSession(rawToken)).rejects.toThrow(
      'commit failed',
    );
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
