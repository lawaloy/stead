import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoalStatus as PrismaGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { EndGoalDto } from './dto/end-goal.dto';
import type { Goal } from '../contracts/generated/types.gen';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGoalDto): Promise<Goal> {
    const goal = await this.prisma.$transaction(async (transaction) => {
      const endedAt = new Date();
      await transaction.goal.updateMany({
        where: { userId, isActive: true },
        data: {
          isActive: false,
          status: PrismaGoalStatus.replaced,
          endedAt,
        },
      });

      return transaction.goal.create({
        data: {
          userId,
          name: dto.name,
          amountTotalKobo: BigInt(dto.amountTotalKobo),
          dueDate: new Date(dto.dueDate),
          monthlyIncomeKobo:
            dto.monthlyIncomeKobo === undefined
              ? null
              : BigInt(dto.monthlyIncomeKobo),
          isActive: true,
          status: PrismaGoalStatus.active,
          endedAt: null,
        },
      });
    });

    return this.serializeGoal(goal);
  }

  async getActive(userId: string): Promise<Goal> {
    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true, status: PrismaGoalStatus.active },
      orderBy: { createdAt: 'desc' },
    });

    if (!goal) throw new NotFoundException('No active goal found');
    return this.serializeGoal(goal);
  }

  async list(userId: string): Promise<Goal[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return goals.map((goal) => this.serializeGoal(goal));
  }

  async update(
    userId: string,
    goalId: string,
    dto: UpdateGoalDto,
  ): Promise<Goal> {
    const goal = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.goal.findFirst({
        where: { id: goalId, userId },
      });
      if (!existing) throw new NotFoundException('Goal not found');

      if (dto.isActive === true) {
        const endedAt = new Date();
        await transaction.goal.updateMany({
          where: { userId, isActive: true, id: { not: goalId } },
          data: {
            isActive: false,
            status: PrismaGoalStatus.replaced,
            endedAt,
          },
        });
      }

      return transaction.goal.update({
        where: { id: goalId },
        data: {
          name: dto.name,
          amountTotalKobo:
            dto.amountTotalKobo === undefined
              ? undefined
              : BigInt(dto.amountTotalKobo),
          dueDate:
            dto.dueDate === undefined ? undefined : new Date(dto.dueDate),
          monthlyIncomeKobo:
            dto.monthlyIncomeKobo === undefined
              ? undefined
              : dto.monthlyIncomeKobo === null
                ? null
                : BigInt(dto.monthlyIncomeKobo),
          isActive: dto.isActive,
          status:
            dto.isActive === true
              ? PrismaGoalStatus.active
              : dto.isActive === false && existing.isActive
                ? PrismaGoalStatus.cancelled
                : undefined,
          endedAt:
            dto.isActive === true
              ? null
              : dto.isActive === false && existing.isActive
                ? new Date()
                : undefined,
        },
      });
    });

    return this.serializeGoal(goal);
  }

  async end(userId: string, goalId: string, dto: EndGoalDto): Promise<Goal> {
    const goal = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.goal.findFirst({
        where: { id: goalId, userId },
      });
      if (!existing) throw new NotFoundException('Goal not found');
      if (!existing.isActive || existing.status !== PrismaGoalStatus.active) {
        throw new BadRequestException('Only the active goal can be ended');
      }

      const result = await transaction.goal.updateMany({
        where: {
          id: goalId,
          userId,
          isActive: true,
          status: PrismaGoalStatus.active,
        },
        data: {
          isActive: false,
          status: dto.status,
          endedAt: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('Only the active goal can be ended');
      }

      const updated = await transaction.goal.findFirst({
        where: { id: goalId, userId },
      });
      if (!updated) throw new NotFoundException('Goal not found');
      return updated;
    });

    return this.serializeGoal(goal);
  }

  private serializeGoal(goal: {
    id: string;
    userId: string;
    name: string;
    amountTotalKobo: bigint;
    dueDate: Date;
    monthlyIncomeKobo: bigint | null;
    isActive: boolean;
    status: PrismaGoalStatus;
    endedAt: Date | null;
    createdAt: Date;
  }): Goal {
    return {
      id: goal.id,
      userId: goal.userId,
      name: goal.name,
      amountTotalKobo: Number(goal.amountTotalKobo),
      dueDate: goal.dueDate.toISOString(),
      monthlyIncomeKobo:
        goal.monthlyIncomeKobo === null ? null : Number(goal.monthlyIncomeKobo),
      isActive: goal.isActive,
      status: goal.status,
      endedAt: goal.endedAt?.toISOString() ?? null,
      createdAt: goal.createdAt.toISOString(),
    };
  }
}
