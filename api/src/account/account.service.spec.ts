import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConsentCategory } from '@prisma/client';
import { NotificationQueueService } from '../notifications/notification-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

const date = new Date('2026-09-08T12:00:00.000Z');
const user = {
  id: 'user_1',
  phone: '+2348012345678',
  displayName: null,
  createdAt: date,
  updatedAt: date,
  consentPreference: null,
};

describe('AccountService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    consentRecord: { createMany: jest.fn(), deleteMany: jest.fn() },
    consentPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    notificationJob: { findMany: jest.fn(), deleteMany: jest.fn() },
    authEvent: { findMany: jest.fn(), deleteMany: jest.fn() },
    otpCode: { deleteMany: jest.fn() },
    transaction: { deleteMany: jest.fn() },
    alertState: { deleteMany: jest.fn() },
    alertPreference: { deleteMany: jest.fn() },
    goal: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const notifications = {
    beginAccountDeletion: jest.fn(),
    restoreForAccount: jest.fn(),
    finalizeAccountDeletion: jest.fn(),
  };
  let service: AccountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationQueueService,
    );
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.consentRecord.createMany.mockResolvedValue({ count: 1 });
    prisma.consentPreference.findUnique.mockResolvedValue(null);
    prisma.consentPreference.upsert.mockResolvedValue({});
    prisma.authEvent.findMany.mockResolvedValue([]);
    notifications.beginAccountDeletion.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
  });

  it('returns optional consents off by default', async () => {
    await expect(service.getAccount('user_1')).resolves.toEqual({
      profile: {
        id: 'user_1',
        phone: '+2348012345678',
        displayName: null,
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      },
      consents: {
        analyticsEnabled: false,
        productResearchEnabled: false,
        updatedAt: null,
      },
    });
  });

  it('trims a display name and permits clearing it', async () => {
    await service.updateProfile('user_1', { displayName: '  Ada  ' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { displayName: 'Ada' },
    });

    await service.updateProfile('user_1', { displayName: null });
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'user_1' },
      data: { displayName: null },
    });
    await expect(
      service.updateProfile('user_1', { displayName: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records only changed consent choices', async () => {
    prisma.consentPreference.findUnique.mockResolvedValue({
      analyticsEnabled: true,
      productResearchEnabled: false,
    });
    await service.updateConsents('user_1', {
      analyticsEnabled: true,
      productResearchEnabled: true,
    });
    expect(prisma.consentRecord.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user_1',
          category: ConsentCategory.product_research,
          granted: true,
        },
      ],
    });
    expect(prisma.consentPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      create: {
        userId: 'user_1',
        analyticsEnabled: true,
        productResearchEnabled: true,
      },
      update: {
        analyticsEnabled: true,
        productResearchEnabled: true,
      },
    });
    await expect(service.updateConsents('user_1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects operations for a missing account', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getAccount('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes notification data before deleting all owned records', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: user.phone });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) => {
        prisma.user.deleteMany.mockResolvedValue({ count: 1 });
        return callback(prisma);
      },
    );

    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).resolves.toMatchObject({ ok: true });
    expect(notifications.beginAccountDeletion).toHaveBeenCalledWith(
      'user_1',
      user.phone,
    );
    expect(prisma.notificationJob.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user_1' }, { id: { in: [] } }] },
    });
    expect(notifications.finalizeAccountDeletion).toHaveBeenCalledWith(
      'user_1',
    );
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
    });
    expect(prisma.authEvent.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user_1' }, { phone: user.phone }] },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
    });
  });

  it('releases the delivery block when account deletion rolls back', async () => {
    prisma.user.findUnique.mockResolvedValue({ phone: user.phone });
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.deleteAccount('user_1', { confirmation: 'DELETE' }),
    ).rejects.toThrow('database unavailable');
    expect(notifications.restoreForAccount).toHaveBeenCalledWith('user_1');
    expect(notifications.finalizeAccountDeletion).not.toHaveBeenCalled();
  });
});
