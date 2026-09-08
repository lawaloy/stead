import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: {
    $transaction: jest.Mock;
    goal: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  const createdAt = new Date('2026-01-10T00:00:00.000Z');
  const dueDate = new Date('2026-03-01T00:00:00.000Z');
  const goalRow = (
    overrides: Partial<{
      id: string;
      userId: string;
      name: string;
      amountTotalKobo: bigint;
      dueDate: Date;
      monthlyIncomeKobo: bigint | null;
      isActive: boolean;
      status: GoalStatus;
      endedAt: Date | null;
      createdAt: Date;
    }> = {},
  ) => ({
    id: 'goal_1',
    userId: 'user_1',
    name: 'Rent buffer',
    amountTotalKobo: 500_000n,
    dueDate,
    monthlyIncomeKobo: 300_000n,
    isActive: true,
    status: GoalStatus.active,
    endedAt: null,
    createdAt,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      goal: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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

  it('replaces the active goal before creating a new active goal', async () => {
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.create.mockResolvedValue(goalRow());

    const result = await service.create('user_1', {
      name: 'Rent buffer',
      amountTotalKobo: 500_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 300_000,
    });

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true },
      data: {
        isActive: false,
        status: GoalStatus.replaced,
        endedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.goal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: 'Rent buffer',
        amountTotalKobo: 500_000n,
        dueDate,
        monthlyIncomeKobo: 300_000n,
        isActive: true,
        status: GoalStatus.active,
        endedAt: null,
      },
    });
    expect(result).toEqual({
      id: 'goal_1',
      userId: 'user_1',
      name: 'Rent buffer',
      amountTotalKobo: 500_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 300_000,
      isActive: true,
      status: 'active',
      endedAt: null,
      createdAt: createdAt.toISOString(),
    });
  });

  it('preserves omitted and zero monthly income values on create', async () => {
    prisma.goal.updateMany.mockResolvedValue({ count: 0 });
    prisma.goal.create
      .mockResolvedValueOnce(goalRow({ monthlyIncomeKobo: null }))
      .mockResolvedValueOnce(goalRow({ monthlyIncomeKobo: 0n }));

    await service.create('user_1', {
      name: 'Emergency fund',
      amountTotalKobo: 250_000,
      dueDate: dueDate.toISOString(),
    });
    const zero = await service.create('user_1', {
      name: 'Emergency fund',
      amountTotalKobo: 250_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 0,
    });

    const createCalls = prisma.goal.create.mock.calls as Array<
      [{ data: { monthlyIncomeKobo: bigint | null } }]
    >;
    expect(createCalls[0]?.[0].data.monthlyIncomeKobo).toBeNull();
    expect(createCalls[1]?.[0].data.monthlyIncomeKobo).toBe(0n);
    expect(zero.monthlyIncomeKobo).toBe(0);
  });

  it('returns only the active lifecycle goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow());

    await expect(service.getActive('user_1')).resolves.toMatchObject({
      id: 'goal_1',
      status: 'active',
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, status: GoalStatus.active },
      orderBy: { createdAt: 'desc' },
    });

    prisma.goal.findFirst.mockResolvedValue(null);
    await expect(service.getActive('user_1')).rejects.toThrow(
      new NotFoundException('No active goal found'),
    );
  });

  it('lists active and historical goals newest first within the user scope', async () => {
    const endedAt = new Date('2026-02-01T00:00:00.000Z');
    prisma.goal.findMany.mockResolvedValue([
      goalRow(),
      goalRow({
        id: 'goal_old',
        isActive: false,
        status: GoalStatus.replaced,
        endedAt,
      }),
    ]);

    await expect(service.list('user_1')).resolves.toEqual([
      expect.objectContaining({
        id: 'goal_1',
        status: 'active',
        endedAt: null,
      }),
      expect.objectContaining({
        id: 'goal_old',
        status: 'replaced',
        endedAt: endedAt.toISOString(),
      }),
    ]);
    expect(prisma.goal.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('rejects updates to goals outside the user scope', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'goal_2', { name: 'Renamed goal' }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('edits goal fields without changing lifecycle state', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow());
    prisma.goal.update.mockResolvedValue(
      goalRow({ name: 'Updated rent', monthlyIncomeKobo: 0n }),
    );

    const result = await service.update('user_1', 'goal_1', {
      name: 'Updated rent',
      monthlyIncomeKobo: 0,
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
    expect(result).toMatchObject({
      name: 'Updated rent',
      monthlyIncomeKobo: 0,
      status: 'active',
    });
  });

  it('maps legacy activation changes onto lifecycle state', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow());
    prisma.goal.updateMany.mockResolvedValue({ count: 1 });
    prisma.goal.update.mockResolvedValueOnce(goalRow()).mockResolvedValueOnce(
      goalRow({
        isActive: false,
        status: GoalStatus.cancelled,
        endedAt: new Date(),
      }),
    );

    await service.update('user_1', 'goal_1', { isActive: true });
    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', isActive: true, id: { not: 'goal_1' } },
      data: {
        isActive: false,
        status: GoalStatus.replaced,
        endedAt: expect.any(Date) as unknown,
      },
    });
    const updateCalls = prisma.goal.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(updateCalls[0]?.[0].data).toMatchObject({
      isActive: true,
      status: GoalStatus.active,
      endedAt: null,
    });

    await service.update('user_1', 'goal_1', { isActive: false });
    expect(updateCalls[1]?.[0].data).toMatchObject({
      isActive: false,
      status: GoalStatus.cancelled,
      endedAt: expect.any(Date) as unknown,
    });
  });

  it('preserves lifecycle history on redundant legacy deactivation', async () => {
    const endedAt = new Date('2026-08-20T12:00:00.000Z');
    const completedGoal = goalRow({
      isActive: false,
      status: GoalStatus.completed,
      endedAt,
    });
    prisma.goal.findFirst.mockResolvedValue(completedGoal);
    prisma.goal.update.mockResolvedValue(completedGoal);

    await expect(
      service.update('user_1', 'goal_1', { isActive: false }),
    ).resolves.toMatchObject({ status: GoalStatus.completed, isActive: false });
    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'goal_1' },
      data: expect.objectContaining({
        isActive: false,
        status: undefined,
        endedAt: undefined,
      }) as unknown,
    });
  });

  it.each([GoalStatus.completed, GoalStatus.cancelled] as const)(
    'ends an active goal as %s',
    async (status) => {
      prisma.goal.findFirst
        .mockResolvedValueOnce(goalRow())
        .mockResolvedValueOnce(
          goalRow({ isActive: false, status, endedAt: new Date() }),
        );
      prisma.goal.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.end('user_1', 'goal_1', { status }),
      ).resolves.toMatchObject({ status, isActive: false });
      expect(prisma.goal.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'goal_1',
          userId: 'user_1',
          isActive: true,
          status: GoalStatus.active,
        },
        data: {
          isActive: false,
          status,
          endedAt: expect.any(Date) as unknown,
        },
      });
    },
  );

  it('rejects ending missing or already-ended goals', async () => {
    prisma.goal.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        goalRow({ isActive: false, status: GoalStatus.cancelled }),
      );

    await expect(
      service.end('user_1', 'missing', { status: 'cancelled' }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));
    await expect(
      service.end('user_1', 'goal_1', { status: 'completed' }),
    ).rejects.toThrow(
      new BadRequestException('Only the active goal can be ended'),
    );
  });

  it('rejects a concurrent end after the active-state check', async () => {
    prisma.goal.findFirst.mockResolvedValue(goalRow());
    prisma.goal.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.end('user_1', 'goal_1', { status: 'completed' }),
    ).rejects.toThrow(
      new BadRequestException('Only the active goal can be ended'),
    );
  });
});
