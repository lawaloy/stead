import { GoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService amount update on an inactive goal', () => {
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
  const endedAt = new Date('2026-08-20T12:00:00.000Z');
  const completedGoal = {
    id: 'goal_old',
    userId: 'user_1',
    name: 'Annual rent',
    amountTotalKobo: 500_000n,
    dueDate,
    monthlyIncomeKobo: 300_000n,
    isActive: false,
    status: GoalStatus.completed,
    endedAt,
    createdAt,
  };

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

  it('persists a new amount on a completed goal without changing lifecycle', async () => {
    prisma.goal.findFirst.mockResolvedValue(completedGoal);
    prisma.goal.update.mockResolvedValue({
      ...completedGoal,
      amountTotalKobo: 750_000n,
    });

    const result = await service.update('user_1', 'goal_old', {
      amountTotalKobo: 750_000,
    });

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_old' },
      data: {
        name: undefined,
        amountTotalKobo: 750_000n,
        dueDate: undefined,
        monthlyIncomeKobo: undefined,
        isActive: undefined,
        status: undefined,
        endedAt: undefined,
      },
    });
    expect(result).toEqual({
      id: 'goal_old',
      userId: 'user_1',
      name: 'Annual rent',
      amountTotalKobo: 750_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 300_000,
      isActive: false,
      status: 'completed',
      endedAt: endedAt.toISOString(),
      createdAt: createdAt.toISOString(),
    });
  });
});
