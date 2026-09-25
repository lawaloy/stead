import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService end write failure', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      goal: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
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

  it('does not treat a goal as completed when the end write fails after the active check', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000n,
      dueDate: new Date('2026-03-01T00:00:00.000Z'),
      monthlyIncomeKobo: 300_000n,
      isActive: true,
      status: GoalStatus.active,
      endedAt: null,
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
    });
    prisma.goal.updateMany.mockRejectedValue(new Error('goal end unavailable'));

    await expect(
      service.end('user_1', 'goal_1', { status: 'completed' }),
    ).rejects.toThrow('goal end unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'goal_1',
        userId: 'user_1',
        isActive: true,
        status: GoalStatus.active,
      },
      data: {
        isActive: false,
        status: GoalStatus.completed,
        endedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledTimes(1);
  });
});
