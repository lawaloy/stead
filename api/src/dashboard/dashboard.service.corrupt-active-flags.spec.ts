import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { computeStability } from './engine';
import { DashboardService } from './dashboard.service';

describe('DashboardService corrupt active flags', () => {
  let service: DashboardService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const today = new Date('2026-01-15T00:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(today);

    prisma = {
      goal: { findFirst: jest.fn() },
      transaction: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('treats an isActive replaced goal as live while Goals getActive would hide it', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_replaced',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: 300_000n,
      isActive: true,
      status: GoalStatus.replaced,
      endedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt,
    });
    prisma.transaction.findMany.mockResolvedValue([
      { amountKobo: 120_000n, direction: 'in', goalId: 'goal_replaced' },
    ]);

    const result = await service.getStability('user_1', today);
    const scored = computeStability({
      goalTotalKobo: 500_000,
      goalSavedKobo: 120_000,
      dueDate,
      today,
      estimatedBalanceKobo: 120_000,
      monthlyIncomeKobo: 300_000,
    });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual({
      ok: true,
      goal: {
        id: 'goal_replaced',
        name: 'Rent buffer',
        amountTotalKobo: 500_000,
        dueDate: dueDate.toISOString(),
        monthlyIncomeKobo: 300_000,
      },
      metrics: {
        ...scored,
        goalSavedKobo: 120_000,
        estimatedBalanceKobo: 120_000,
      },
    });
  });
});
