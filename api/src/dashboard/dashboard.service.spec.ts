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

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
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

  it('returns a no-active-goal response without reading transactions', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(service.getStability('user_1')).resolves.toEqual({
      ok: false,
      message: 'No active goal found',
    });
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('aggregates balance and goal savings before computing stability', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      name: 'Rent',
      userId: 'user_1',
      amountTotalKobo: 10_000n,
      dueDate: new Date('2026-01-31T00:00:00.000Z'),
      monthlyIncomeKobo: 2_500n,
      createdAt: new Date('2025-12-01T00:00:00.000Z'),
    });
    prisma.transaction.findMany.mockResolvedValue([
      { amountKobo: 4_000n, direction: 'in', goalId: 'goal_1' },
      { amountKobo: 250n, direction: 'out', goalId: 'goal_1' },
      { amountKobo: 1_000n, direction: 'in', goalId: null },
      { amountKobo: 500n, direction: 'out', goalId: null },
    ]);

    await expect(service.getStability('user_1')).resolves.toMatchObject({
      ok: true,
      goal: {
        id: 'goal_1',
        name: 'Rent',
        amountTotalKobo: 10_000,
        monthlyIncomeKobo: 2_500,
      },
      metrics: {
        goalSavedKobo: 3_750,
        estimatedBalanceKobo: 4_250,
        daysRemaining: 30,
        status: 'warning',
      },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      select: {
        amountKobo: true,
        direction: true,
        goalId: true,
      },
    });
  });
});
