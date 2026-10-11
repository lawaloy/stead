import { NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService end reload failure after write', () => {
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

  it('does not treat a post-end reload outage as a missing goal', async () => {
    const reloadFail = new Error('goal reload unavailable after end write');
    prisma.goal.findFirst
      .mockResolvedValueOnce({
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
      })
      .mockRejectedValueOnce(reloadFail);
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });

    const error = await service
      .end('user_1', 'goal_1', { status: 'completed' })
      .catch((reason: unknown) => reason);

    expect(error).toBe(reloadFail);
    expect(error).not.toBeInstanceOf(NotFoundException);
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
    expect(prisma.goal.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.goal.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'goal_1', userId: 'user_1' },
    });
  });
});
