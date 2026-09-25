import { GoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService monthly income clear', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const goalRow = (overrides: { monthlyIncomeKobo?: bigint | null } = {}) => ({
    id: 'goal_1',
    userId: 'user_1',
    name: 'Rent buffer',
    amountTotalKobo: 500_000n,
    dueDate,
    monthlyIncomeKobo: 300_000n,
    isActive: true,
    status: GoalStatus.active,
    endedAt: null,
    createdAt,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      goal: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    service = new GoalsService(prisma as unknown as PrismaService);
  });

  it('clears monthly income when update sets monthlyIncomeKobo to null', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow());
    prisma.goal.update.mockResolvedValue(goalRow({ monthlyIncomeKobo: null }));

    const result = await service.update('user_1', 'goal_1', {
      monthlyIncomeKobo: null,
    });

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: undefined,
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: null,
        isActive: undefined,
        status: undefined,
        endedAt: undefined,
      },
    });
    expect(result.monthlyIncomeKobo).toBeNull();
  });
});
