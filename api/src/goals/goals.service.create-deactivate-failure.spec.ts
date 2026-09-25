import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService create deactivate failure', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      updateMany: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      goal: {
        updateMany: jest.fn(),
        create: jest.fn(),
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

  it('does not insert a replacement when deactivating the current active goal fails', async () => {
    prisma.goal.updateMany.mockRejectedValue(
      new Error('goal deactivate unavailable'),
    );

    await expect(
      service.create('user_1', {
        name: 'Rent buffer',
        amountTotalKobo: 500_000,
        dueDate: '2026-03-01T00:00:00.000Z',
        monthlyIncomeKobo: 300_000,
      }),
    ).rejects.toThrow('goal deactivate unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      data: {
        isActive: false,
        status: GoalStatus.replaced,
        endedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.goal.create).not.toHaveBeenCalled();
  });
});
