import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService ownership read failure', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
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

  it('does not patch a goal when the ownership lookup fails', async () => {
    const failure = new Error('goal ownership lookup unavailable');
    prisma.goal.findFirst.mockRejectedValue(failure);

    await expect(
      service.update('user_1', 'goal_1', { name: 'Renamed goal' }),
    ).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
    });
    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('does not end a goal when the ownership lookup fails', async () => {
    const failure = new Error('goal ownership lookup unavailable');
    prisma.goal.findFirst.mockRejectedValue(failure);

    await expect(
      service.end('user_1', 'goal_1', { status: 'completed' }),
    ).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
    });
    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
  });
});
