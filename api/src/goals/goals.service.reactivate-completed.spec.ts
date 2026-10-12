import { GoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService reactivation of a completed goal', () => {
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

  it('resurrects a completed goal and replaces any other active goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(completedGoal);
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.update.mockResolvedValue({
      ...completedGoal,
      isActive: true,
      status: GoalStatus.active,
      endedAt: null,
    });

    const result = await service.update('user_1', 'goal_old', {
      isActive: true,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, id: { not: 'goal_old' } },
      data: {
        isActive: false,
        status: GoalStatus.replaced,
        endedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_old' },
      data: {
        name: undefined,
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: undefined,
        isActive: true,
        status: GoalStatus.active,
        endedAt: null,
      },
    });
    expect(result).toEqual({
      id: 'goal_old',
      userId: 'user_1',
      name: 'Annual rent',
      amountTotalKobo: 500_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 300_000,
      isActive: true,
      status: 'active',
      endedAt: null,
      createdAt: createdAt.toISOString(),
    });
  });
});
