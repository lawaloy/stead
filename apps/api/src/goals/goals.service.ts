import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGoalDto) {
    await this.prisma.goal.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const goal = await this.prisma.goal.create({
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
      },
    });

    return this.serializeGoal(goal);
  }

  async getActive(userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!goal) throw new NotFoundException('No active goal found');
    return this.serializeGoal(goal);
  }

  async update(userId: string, goalId: string, dto: UpdateGoalDto) {
    const existing = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
    });
    if (!existing) throw new NotFoundException('Goal not found');

    if (dto.isActive === true) {
      await this.prisma.goal.updateMany({
        where: { userId, isActive: true, id: { not: goalId } },
        data: { isActive: false },
      });
    }

    const goal = await this.prisma.goal.update({
      where: { id: goalId },
      data: {
        name: dto.name,
        amountTotalKobo:
          dto.amountTotalKobo === undefined
            ? undefined
            : BigInt(dto.amountTotalKobo),
        dueDate: dto.dueDate === undefined ? undefined : new Date(dto.dueDate),
        monthlyIncomeKobo:
          dto.monthlyIncomeKobo === undefined
            ? undefined
            : BigInt(dto.monthlyIncomeKobo),
        isActive: dto.isActive,
      },
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
    createdAt: Date;
  }) {
    return {
      id: goal.id,
      userId: goal.userId,
      name: goal.name,
      amountTotalKobo: Number(goal.amountTotalKobo),
      dueDate: goal.dueDate,
      monthlyIncomeKobo:
        goal.monthlyIncomeKobo === null ? null : Number(goal.monthlyIncomeKobo),
      isActive: goal.isActive,
      createdAt: goal.createdAt,
    };
  }
}
