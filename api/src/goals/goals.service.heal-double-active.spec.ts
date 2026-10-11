import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService double-active self-heal', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const activeGoal = (id: string) => ({
    id,
    userId: 'user_1',
    name: 'Rent buffer',
    amountTotalKobo: 500_000n,
    dueDate,
    monthlyIncomeKobo: 300_000n,
    isActive: true,
    status: GoalStatus.active,
    endedAt: null,
    createdAt,
  });

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

  it('deactivates a sibling active goal when PATCHing an already-active goal active', async () => {
    const target = activeGoal('goal_kept');
    prisma.goal.findFirst.mockResolvedValue(target);
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.update.mockResolvedValue(target);

    await expect(
      service.update('user_1', 'goal_kept', { isActive: true }),
    ).resolves.toMatchObject({
      id: 'goal_kept',
      isActive: true,
      status: 'active',
      endedAt: null,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, id: { not: 'goal_kept' } },
      data: {
        isActive: false,
        status: GoalStatus.replaced,
        endedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_kept' },
      data: expect.objectContaining({
        isActive: true,
        status: GoalStatus.active,
        endedAt: null,
      }) as unknown,
    });
  });
});
