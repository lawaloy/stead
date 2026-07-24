import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');
  const transactionRecord = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 12_500n,
    direction: 'out',
    occurredAt,
    note: 'Groceries',
    createdAt: new Date('2026-01-02T03:05:06.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates transactions scoped to the authenticated user and owned goal', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord);

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        goalId: 'goal_1',
        note: 'Groceries',
      }),
    ).resolves.toEqual({
      ...transactionRecord,
      amountKobo: 12_500,
    });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: 'goal_1',
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: 'Groceries',
      },
    });
  });

  it('rejects creating a transaction for another user goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 50_000,
        occurredAt: occurredAt.toISOString(),
        goalId: 'goal_2',
      }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('creates transactions without checking goal ownership when no goal is linked', async () => {
    const unlinked = { ...transactionRecord, goalId: null, note: null };
    prisma.transaction.create.mockResolvedValue(unlinked);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
      }),
    ).resolves.toEqual({ ...unlinked, amountKobo: 12_500 });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: null,
        direction: 'in',
        amountKobo: 12_500n,
        occurredAt,
        note: null,
      },
    });
  });

  it('lists only transactions belonging to the authenticated user within date filters', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(
      service.list('user_1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.000Z',
      }),
    ).resolves.toEqual([{ ...transactionRecord, amountKobo: 12_500 }]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-31T23:59:59.000Z'),
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('lists user transactions without date bounds when filters are omitted', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(service.list('user_1', {})).resolves.toEqual([
      { ...transactionRecord, amountKobo: 12_500 },
    ]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: undefined,
          lte: undefined,
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('rejects updating another user transaction before writing changes', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'tx_2', {
        amountKobo: 9_000,
      }),
    ).rejects.toThrow(new NotFoundException('Transaction not found'));

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects moving a transaction onto another user goal', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'tx_1', {
        goalId: 'goal_2',
      }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects deleting another user transaction before deleting', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(service.remove('user_1', 'tx_2')).rejects.toThrow(
      new NotFoundException('Transaction not found'),
    );

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('updates an owned transaction after ownership checks pass', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      note: 'corrected note',
      amountKobo: 9_000n,
    });

    await expect(
      service.update('user_1', 'tx_1', {
        amountKobo: 9_000,
        goalId: 'goal_1',
        note: 'corrected note',
      }),
    ).resolves.toEqual({
      ...transactionRecord,
      note: 'corrected note',
      amountKobo: 9_000,
    });

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: 9_000n,
        occurredAt: undefined,
        goalId: 'goal_1',
        note: 'corrected note',
      },
    });
  });

  it('deletes an owned transaction after ownership checks pass', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.delete.mockResolvedValue(transactionRecord);

    await expect(service.remove('user_1', 'tx_1')).resolves.toEqual({
      ok: true,
    });

    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
    });
  });
});
