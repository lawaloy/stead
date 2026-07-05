import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: {
    goal: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  const goalRecord = {
    id: 'goal_1',
    userId: 'user_1',
    name: 'Rent',
    amountTotalKobo: 10_000n,
    dueDate: new Date('2026-01-31T00:00:00.000Z'),
    monthlyIncomeKobo: 5_000n,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      goal: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deactivates existing active goals before creating a new active goal', async () => {
    prisma.goal.create.mockResolvedValue(goalRecord);

    await expect(
      service.create('user_1', {
        name: 'Rent',
        amountTotalKobo: 10_000,
        dueDate: '2026-01-31T00:00:00.000Z',
        monthlyIncomeKobo: 5_000,
      }),
    ).resolves.toEqual({
      ...goalRecord,
      amountTotalKobo: 10_000,
      monthlyIncomeKobo: 5_000,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      data: { isActive: false },
    });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Rent',
        amountTotalKobo: 10_000n,
        dueDate: new Date('2026-01-31T00:00:00.000Z'),
        monthlyIncomeKobo: 5_000n,
        isActive: true,
      },
    });
  });

  it('deactivates sibling goals when reactivating an existing goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRecord);
    prisma.goal.update.mockResolvedValue({
      ...goalRecord,
      name: 'Updated rent',
    });

    await expect(
      service.update('user_1', 'goal_1', {
        name: 'Updated rent',
        isActive: true,
      }),
    ).resolves.toMatchObject({
      id: 'goal_1',
      name: 'Updated rent',
      isActive: true,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, id: { not: 'goal_1' } },
      data: { isActive: false },
    });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: 'Updated rent',
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: undefined,
        isActive: true,
      },
    });
  });

  it('rejects updates to goals outside the user boundary', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'goal_2', { name: 'Other goal' }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });
});
