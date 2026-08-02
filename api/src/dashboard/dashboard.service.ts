import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeStability } from './engine';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStability(userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!goal) return { ok: false as const, message: 'No active goal found' };

    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        amountKobo: true,
        direction: true,
        goalId: true,
      },
    });

    const estimatedBalanceKobo = transactions.reduce((sum, tx) => {
      const amount = Number(tx.amountKobo);
      return tx.direction === 'in' ? sum + amount : sum - amount;
    }, 0);

    const goalSavedKobo = transactions.reduce((sum, tx) => {
      if (tx.goalId !== goal.id) return sum;
      const amount = Number(tx.amountKobo);
      return tx.direction === 'in' ? sum + amount : sum - amount;
    }, 0);

    const result = computeStability({
      goalTotalKobo: Number(goal.amountTotalKobo),
      goalSavedKobo,
      dueDate: goal.dueDate,
      today: new Date(),
      estimatedBalanceKobo,
      monthlyIncomeKobo: goal.monthlyIncomeKobo
        ? Number(goal.monthlyIncomeKobo)
        : null,
    });

    return {
      ok: true as const,
      goal: {
        id: goal.id,
        name: goal.name,
        amountTotalKobo: Number(goal.amountTotalKobo),
        dueDate: goal.dueDate,
        monthlyIncomeKobo: goal.monthlyIncomeKobo
          ? Number(goal.monthlyIncomeKobo)
          : null,
      },
      metrics: {
        ...result,
        goalSavedKobo,
        estimatedBalanceKobo,
      },
    };
  }
}
