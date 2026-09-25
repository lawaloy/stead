import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { computeStability } from './engine';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService corrupt transaction direction', () => {
  let service: DashboardService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const dueDate = new Date('2026-02-14T00:00:00.000Z');
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

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not treat an unrecognized direction as income when scoring stability', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'School fees',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: 400_000n,
      isActive: true,
      createdAt,
    });
    prisma.transaction.findMany.mockResolvedValue([
      { amountKobo: 100_000n, direction: 'in', goalId: 'goal_1' },
      { amountKobo: 40_000n, direction: 'transfer', goalId: 'goal_1' },
    ]);

    const result = await service.getStability('user_1', today);
    const scored = computeStability({
      goalTotalKobo: 500_000,
      goalSavedKobo: 60_000,
      dueDate,
      today,
      estimatedBalanceKobo: 60_000,
      monthlyIncomeKobo: 400_000,
    });

    expect(result).toEqual({
      ok: true,
      goal: {
        id: 'goal_1',
        name: 'School fees',
        amountTotalKobo: 500_000,
        dueDate: dueDate.toISOString(),
        monthlyIncomeKobo: 400_000,
      },
      metrics: {
        ...scored,
        goalSavedKobo: 60_000,
        estimatedBalanceKobo: 60_000,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      metrics: {
        goalSavedKobo: 60_000,
        estimatedBalanceKobo: 60_000,
      },
    });
  });
});
