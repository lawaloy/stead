import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { computeStability } from './engine';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService double-active newest goal', () => {
  let service: DashboardService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  const newerCreatedAt = new Date('2026-02-01T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const today = new Date('2026-02-15T00:00:00.000Z');

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

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scores the newest active goal and excludes older-goal savings', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_new',
      userId: 'user_1',
      name: 'New rent',
      amountTotalKobo: 200_000n,
      dueDate,
      monthlyIncomeKobo: 300_000n,
      isActive: true,
      createdAt: newerCreatedAt,
    });
    prisma.transaction.findMany.mockResolvedValue([
      { amountKobo: 400_000n, direction: 'in', goalId: 'goal_old' },
      { amountKobo: 50_000n, direction: 'in', goalId: 'goal_new' },
      { amountKobo: 10_000n, direction: 'out', goalId: 'goal_new' },
      { amountKobo: 20_000n, direction: 'in', goalId: null },
    ]);

    const result = await service.getStability('user_1', today);
    const scored = computeStability({
      goalTotalKobo: 200_000,
      goalSavedKobo: 40_000,
      dueDate,
      today,
      estimatedBalanceKobo: 460_000,
      monthlyIncomeKobo: 300_000,
    });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual({
      ok: true,
      goal: {
        id: 'goal_new',
        name: 'New rent',
        amountTotalKobo: 200_000,
        dueDate: dueDate.toISOString(),
        monthlyIncomeKobo: 300_000,
      },
      metrics: {
        ...scored,
        goalSavedKobo: 40_000,
        estimatedBalanceKobo: 460_000,
      },
    });
    expect(result).not.toMatchObject({
      goal: { id: 'goal_old' },
    });
    expect(result).not.toMatchObject({
      metrics: { goalSavedKobo: 440_000 },
    });
  });
});
