import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService owned inactive goal linkage', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');
  const createdAt = new Date('2026-01-02T03:05:06.000Z');
  const ownershipLookup = {
    where: { id: 'goal_old', userId: 'user_1' },
    select: { id: true },
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('creates a transaction on an owned completed goal without a lifecycle check', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_old' });
    prisma.transaction.create.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_old',
      amountKobo: 12_500n,
      direction: 'out',
      occurredAt,
      note: 'Historical rent',
      createdAt,
    });

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        goalId: 'goal_old',
        note: 'Historical rent',
      }),
    ).resolves.toMatchObject({ goalId: 'goal_old', amountKobo: 12_500 });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith(ownershipLookup);
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: 'goal_old',
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: 'Historical rent',
      },
    });
  });

  it('moves a transaction onto an owned replaced goal without a lifecycle check', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_old' });
    prisma.transaction.update.mockResolvedValue({
      id: 'tx_1',
      userId: 'user_1',
      goalId: 'goal_old',
      amountKobo: 12_500n,
      direction: 'out',
      occurredAt,
      note: 'Groceries',
      createdAt,
    });

    await expect(
      service.update('user_1', 'tx_1', { goalId: 'goal_old' }),
    ).resolves.toMatchObject({ goalId: 'goal_old' });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith(ownershipLookup);
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: undefined,
        occurredAt: undefined,
        goalId: 'goal_old',
        note: undefined,
      },
    });
  });

  it('imports selected rows onto an owned completed goal without a lifecycle check', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_old' });
    prisma.transaction.createMany.mockResolvedValue({ count: 1 });
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
    ].join('\n');
    const parsed = parseTransactionImport(csv);

    await expect(
      service.confirmImport('user_1', {
        csv,
        goalId: 'goal_old',
        rowNumbers: [2],
      }),
    ).resolves.toEqual({ importedCount: 1, duplicateCount: 0 });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith(ownershipLookup);
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: 'goal_old',
          direction: 'in',
          amountKobo: 100_000n,
          note: 'Salary',
          importFingerprint: parsed[0].fingerprint,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
