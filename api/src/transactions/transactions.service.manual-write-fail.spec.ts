import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService manual persist failures', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');

  beforeEach(() => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
      },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces a create write failure instead of a serialized transaction', async () => {
    prisma.transaction.create.mockRejectedValue(
      new Error('manual create unavailable'),
    );

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        note: 'Groceries',
      }),
    ).rejects.toThrow('manual create unavailable');

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: null,
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: 'Groceries',
      },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('surfaces an update write failure after ownership checks pass', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.update.mockRejectedValue(
      new Error('manual update unavailable'),
    );

    await expect(
      service.update('user_1', 'tx_1', { amountKobo: 9_000 }),
    ).rejects.toThrow('manual update unavailable');

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: 9_000n,
        occurredAt: undefined,
        goalId: undefined,
        note: undefined,
      },
    });
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('surfaces a delete write failure instead of { ok: true }', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.delete.mockRejectedValue(
      new Error('manual delete unavailable'),
    );

    await expect(service.remove('user_1', 'tx_1')).rejects.toThrow(
      'manual delete unavailable',
    );

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
