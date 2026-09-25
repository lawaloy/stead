import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { computeStability } from './engine';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService negative goal-linked savings', () => {
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

  it('exposes raw negative goalSavedKobo while scoring as if saved were zero', async () => {
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
      { amountKobo: 250_000n, direction: 'out', goalId: 'goal_1' },
      { amountKobo: 40_000n, direction: 'in', goalId: null },
    ]);

    const result = await service.getStability('user_1');
    const scoredAsZero = computeStability({
      goalTotalKobo: 500_000,
      goalSavedKobo: 0,
      dueDate,
      today,
      estimatedBalanceKobo: -110_000,
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
        ...scoredAsZero,
        goalSavedKobo: -150_000,
        estimatedBalanceKobo: -110_000,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      metrics: {
        readinessPct: 0,
        remainingObligationKobo: 500_000,
        goalSavedKobo: -150_000,
      },
    });
  });
});
