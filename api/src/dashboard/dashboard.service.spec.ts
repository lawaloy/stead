import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    goal: {
      findFirst: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
    };
  };

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const dueDate = new Date('2026-02-14T00:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-15T00:00:00.000Z'));

    prisma = {
      goal: {
        findFirst: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a no-active-goal response without querying transactions', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(service.getStability('user_1')).resolves.toEqual({
      ok: false,
      message: 'No active goal found',
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('aggregates user transactions into goal and stability metrics', async () => {
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
      {
        amountKobo: 200_000n,
        direction: 'in',
        goalId: 'goal_1',
      },
      {
        amountKobo: 50_000n,
        direction: 'out',
        goalId: 'goal_1',
      },
      {
        amountKobo: 30_000n,
        direction: 'in',
        goalId: 'goal_2',
      },
      {
        amountKobo: 20_000n,
        direction: 'out',
        goalId: null,
      },
    ]);

    const result = await service.getStability('user_1');

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: {
        amountKobo: true,
        direction: true,
        goalId: true,
      },
    });
    expect(result).toEqual({
      ok: true,
      goal: {
        id: 'goal_1',
        name: 'School fees',
        amountTotalKobo: 500_000,
        dueDate,
        monthlyIncomeKobo: 400_000,
      },
      metrics: {
        daysRemaining: 30,
        remainingObligationKobo: 350_000,
        readinessPct: 30,
        paceRequiredMonthlyKobo: 350_000,
        safeToSpendKobo: 0,
        stabilityScore: 46,
        status: 'warning',
        goalSavedKobo: 150_000,
        estimatedBalanceKobo: 160_000,
      },
    });
  });

  it('passes null monthly income through to goal and stability metrics', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'School fees',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });
    prisma.transaction.findMany.mockResolvedValue([
      {
        amountKobo: 150_000n,
        direction: 'in',
        goalId: 'goal_1',
      },
    ]);

    const result = await service.getStability('user_1');

    expect(result).toMatchObject({
      ok: true,
      goal: {
        id: 'goal_1',
        monthlyIncomeKobo: null,
      },
      metrics: {
        goalSavedKobo: 150_000,
        estimatedBalanceKobo: 150_000,
        status: 'critical',
      },
    });
    if (result.ok) {
      expect(result.goal.monthlyIncomeKobo).toBeNull();
    }
  });

  it('coerces zero monthly income bigint to null for stability scoring', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'School fees',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: 0n,
      isActive: true,
      createdAt,
    });
    prisma.transaction.findMany.mockResolvedValue([
      {
        amountKobo: 150_000n,
        direction: 'in',
        goalId: 'goal_1',
      },
    ]);

    const withZero = await service.getStability('user_1');

    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'School fees',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });
    const withNull = await service.getStability('user_1');

    expect(withZero).toEqual(withNull);
    if (withZero.ok) {
      expect(withZero.goal.monthlyIncomeKobo).toBeNull();
    }
  });
});
