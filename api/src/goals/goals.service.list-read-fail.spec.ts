import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService list read failure', () => {
  let service: GoalsService;
  let prisma: {
    goal: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      goal: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GoalsService);
  });

  it('surfaces a goal inventory query failure instead of an empty list', async () => {
    const failure = new Error('goal list unavailable');
    prisma.goal.findMany.mockRejectedValue(failure);

    await expect(service.list('user_1')).rejects.toBe(failure);

    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });
});
