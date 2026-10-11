import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService field-edit persist failure', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  const active = {
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

  it('does not return an edited goal when the persist write fails', async () => {
    prisma.goal.findFirst.mockResolvedValue(active);
    prisma.goal.update.mockRejectedValue(
      new Error('goal field persist unavailable'),
    );

    await expect(
      service.update('user_1', 'goal_1', {
        name: 'Updated rent',
        monthlyIncomeKobo: 0,
      }),
    ).rejects.toThrow('goal field persist unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
    });
    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: 'Updated rent',
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: 0n,
        isActive: undefined,
        status: undefined,
        endedAt: undefined,
      },
    });
  });
});
