import { BadRequestException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService end on corrupt active flags', () => {
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

  it('rejects end when isActive is true but lifecycle status is not active', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000n,
      dueDate: new Date('2026-03-01T00:00:00.000Z'),
      monthlyIncomeKobo: 300_000n,
      isActive: true,
      status: GoalStatus.replaced,
      endedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-10T00:00:00.000Z'),
    });

    await expect(
      service.end('user_1', 'goal_1', { status: 'completed' }),
    ).rejects.toThrow(
      new BadRequestException('Only the active goal can be ended'),
    );
    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
  });
});
