import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService reactivate update failure', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  const inactive = {
    id: 'goal_old',
    userId: 'user_1',
    name: 'Rent buffer',
    amountTotalKobo: 500_000n,
    dueDate: new Date('2026-03-01T00:00:00.000Z'),
    monthlyIncomeKobo: 300_000n,
    isActive: false,
    status: GoalStatus.replaced,
    endedAt: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      goal: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GoalsService);
  });

  it('rejects reactivation when the final update fails after replacing other actives', async () => {
    prisma.goal.findFirst.mockResolvedValue(inactive);
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.update.mockRejectedValue(new Error('goal update unavailable'));

    await expect(
      service.update('user_1', 'goal_old', { isActive: true }),
    ).rejects.toThrow('goal update unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
  });
});
