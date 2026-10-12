import { NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from '../goals/goals.service';
import { DashboardService } from './dashboard.service';

describe('Dashboard vs Goals active-goal filter divergence', () => {
  let dashboard: DashboardService;
  let goals: GoalsService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const today = new Date('2026-01-15T00:00:00.000Z');
  const endedAt = new Date('2026-02-01T00:00:00.000Z');
  const corruptGoal = {
    id: 'goal_replaced',
    userId: 'user_1',
    name: 'Rent buffer',
    amountTotalKobo: 500_000n,
    dueDate,
    monthlyIncomeKobo: 300_000n,
    isActive: true,
    status: GoalStatus.replaced,
    endedAt,
    createdAt,
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(today);

    prisma = {
      goal: {
        findFirst: jest.fn(
          (args: {
            where?: {
              userId?: string;
              isActive?: boolean;
              status?: GoalStatus;
            };
          }) => {
            const where = args.where ?? {};
            if (where.userId && where.userId !== corruptGoal.userId) {
              return null;
            }
            if (where.isActive === true && !corruptGoal.isActive) {
              return null;
            }
            if (where.status && where.status !== corruptGoal.status) {
              return null;
            }
            return corruptGoal;
          },
        ),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountKobo: 120_000n,
            direction: 'in',
            goalId: 'goal_replaced',
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        GoalsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    dashboard = module.get(DashboardService);
    goals = module.get(GoalsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves dashboard metrics for an isActive replaced goal that getActive hides', async () => {
    const stability = await dashboard.getStability('user_1', today);

    await expect(goals.getActive('user_1')).rejects.toThrow(
      new NotFoundException('No active goal found'),
    );

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        isActive: true,
        status: GoalStatus.active,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(stability).toMatchObject({
      ok: true,
      goal: {
        id: 'goal_replaced',
        name: 'Rent buffer',
        amountTotalKobo: 500_000,
      },
    });
  });
});
