import { NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService getActive read failure', () => {
  let service: GoalsService;
  let prisma: {
    goal: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      goal: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GoalsService);
  });

  it('surfaces a goal query failure instead of a no-active-goal 404', async () => {
    const failure = new Error('active goal lookup unavailable');
    prisma.goal.findFirst.mockRejectedValue(failure);

    const error = await service
      .getActive('user_1')
      .catch((reason: unknown) => reason);

    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(NotFoundException);

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, status: GoalStatus.active },
      orderBy: { createdAt: 'desc' },
    });
  });
});
