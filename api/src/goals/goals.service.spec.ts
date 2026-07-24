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

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');

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
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.create.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: 300_000n,
      isActive: true,
      createdAt,
    });

    const result = await service.create('user_1', {
      name: 'Rent buffer',
      amountTotalKobo: 500_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 300_000,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      data: { isActive: false },
    });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Rent buffer',
        amountTotalKobo: 500_000n,
        dueDate,
        monthlyIncomeKobo: 300_000n,
        isActive: true,
      },
    });
    expect(result).toEqual({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000,
      dueDate,
      monthlyIncomeKobo: 300_000,
      isActive: true,
      createdAt,
    });
  });

  it('stores null monthly income when create omits monthlyIncomeKobo', async () => {
    prisma.goal.updateMany.mockResolvedValue({ count: 0 });
    prisma.goal.create.mockResolvedValue({
      id: 'goal_2',
      userId: 'user_1',
      name: 'Emergency fund',
      amountTotalKobo: 250_000n,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });

    const result = await service.create('user_1', {
      name: 'Emergency fund',
      amountTotalKobo: 250_000,
      dueDate: dueDate.toISOString(),
    });

    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Emergency fund',
        amountTotalKobo: 250_000n,
        dueDate,
        monthlyIncomeKobo: null,
        isActive: true,
      },
    });
    expect(result).toEqual({
      id: 'goal_2',
      userId: 'user_1',
      name: 'Emergency fund',
      amountTotalKobo: 250_000,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });
  });

  it('returns the newest active goal for the user', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Emergency fund',
      amountTotalKobo: 250_000n,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });

    const result = await service.getActive('user_1');

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Emergency fund',
      amountTotalKobo: 250_000,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: true,
      createdAt,
    });
  });

  it('throws when the user has no active goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(service.getActive('user_1')).rejects.toThrow(
      new NotFoundException('No active goal found'),
    );
  });

  it('rejects updates to goals outside the user scope', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'goal_2', { name: 'Renamed goal' }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
    });
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('persists zero monthly income as 0n when update supplies monthlyIncomeKobo: 0', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
    });
    prisma.goal.update.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: 0n,
      isActive: true,
      createdAt,
    });

    const result = await service.update('user_1', 'goal_1', {
      monthlyIncomeKobo: 0,
    });

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: undefined,
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: 0n,
        isActive: undefined,
      },
    });
    expect(result.monthlyIncomeKobo).toBe(0);
  });

  it('deactivates sibling goals when an existing goal becomes active', async () => {
    const updatedDueDate = new Date('2026-04-01T00:00:00.000Z');
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
    });
    prisma.goal.updateMany.mockResolvedValue({ count: 2 });
    prisma.goal.update.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Updated goal',
      amountTotalKobo: 750_000n,
      dueDate: updatedDueDate,
      monthlyIncomeKobo: 450_000n,
      isActive: true,
      createdAt,
    });

    const result = await service.update('user_1', 'goal_1', {
      name: 'Updated goal',
      amountTotalKobo: 750_000,
      dueDate: updatedDueDate.toISOString(),
      monthlyIncomeKobo: 450_000,
      isActive: true,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, id: { not: 'goal_1' } },
      data: { isActive: false },
    });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: 'Updated goal',
        amountTotalKobo: 750_000n,
        dueDate: updatedDueDate,
        monthlyIncomeKobo: 450_000n,
        isActive: true,
      },
    });
    expect(result).toEqual({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Updated goal',
      amountTotalKobo: 750_000,
      dueDate: updatedDueDate,
      monthlyIncomeKobo: 450_000,
      isActive: true,
      createdAt,
    });
  });

  it('does not deactivate sibling goals when the update is not activating', async () => {
    prisma.goal.findFirst.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
    });
    prisma.goal.update.mockResolvedValue({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Renamed inactive goal',
      amountTotalKobo: 500_000n,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: false,
      createdAt,
    });

    const result = await service.update('user_1', 'goal_1', {
      name: 'Renamed inactive goal',
      isActive: false,
    });

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: {
        name: 'Renamed inactive goal',
        amountTotalKobo: undefined,
        dueDate: undefined,
        monthlyIncomeKobo: undefined,
        isActive: false,
      },
    });
    expect(result).toEqual({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Renamed inactive goal',
      amountTotalKobo: 500_000,
      dueDate,
      monthlyIncomeKobo: null,
      isActive: false,
      createdAt,
    });
  });
});
