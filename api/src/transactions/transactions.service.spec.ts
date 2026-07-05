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

  const transactionRecord = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 5_000n,
    direction: 'in',
    occurredAt: new Date('2026-01-02T00:00:00.000Z'),
    note: 'Saved',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
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

  it('rejects creating a transaction for another user goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 5_000,
        occurredAt: '2026-01-02T00:00:00.000Z',
        goalId: 'goal_2',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('creates and serializes a transaction after goal ownership is verified', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 5_000,
        occurredAt: '2026-01-02T00:00:00.000Z',
        goalId: 'goal_1',
        note: 'Saved',
      }),
    ).resolves.toEqual({
      ...transactionRecord,
      amountKobo: 5_000,
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: 'goal_1',
        direction: 'in',
        amountKobo: 5_000n,
        occurredAt: new Date('2026-01-02T00:00:00.000Z'),
        note: 'Saved',
      },
    });
  });

  it('rejects updating transactions outside the user boundary', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'tx_2', { note: 'Not mine' }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects deleting transactions outside the user boundary', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(service.remove('user_1', 'tx_2')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });
});
