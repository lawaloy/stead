import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService explicit today override', () => {
  let service: DashboardService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const dueDate = new Date('2026-01-31T00:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

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

    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'School fees',
      amountTotalKobo: 300_000n,
      dueDate,
      monthlyIncomeKobo: 400_000n,
      isActive: true,
      createdAt,
    });
    prisma.transaction.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the caller-supplied today for remaining-day math instead of wall-clock time', async () => {
    const dayBeforeDue = await service.getStability(
      'user_1',
      new Date('2026-01-30T00:00:00.000Z'),
    );
    const onDueDate = await service.getStability(
      'user_1',
      new Date('2026-01-31T00:00:00.000Z'),
    );

    expect(dayBeforeDue).toMatchObject({
      ok: true,
      metrics: { daysRemaining: 1 },
    });
    expect(onDueDate).toMatchObject({
      ok: true,
      metrics: { daysRemaining: 0 },
    });
    expect(dayBeforeDue).not.toEqual(onDueDate);
  });
});
