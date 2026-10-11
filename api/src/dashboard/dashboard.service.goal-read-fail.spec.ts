import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService getStability when goal load fails', () => {
  let service: DashboardService;
  let prisma: {
    goal: { findFirst: jest.Mock };
    transaction: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      goal: { findFirst: jest.fn() },
      transaction: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  it('surfaces a goal query failure instead of a no-active-goal response', async () => {
    prisma.goal.findFirst.mockRejectedValue(new Error('goal read unavailable'));

    await expect(service.getStability('user_1')).rejects.toThrow(
      'goal read unavailable',
    );

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});
