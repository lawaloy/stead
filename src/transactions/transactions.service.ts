import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto) {
    if (dto.goalId) await this.ensureGoalBelongsToUser(dto.goalId, userId);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        goalId: dto.goalId || null,
        direction: dto.direction,
        amountKobo: BigInt(dto.amountKobo),
        occurredAt: new Date(dto.occurredAt),
        note: dto.note || null,
      },
    });

    return this.serializeTransaction(transaction);
  }

  async list(userId: string, query: ListTransactionsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { occurredAt: 'desc' },
    });

    return transactions.map((transaction) =>
      this.serializeTransaction(transaction),
    );
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    await this.ensureTransactionBelongsToUser(id, userId);
    if (dto.goalId) await this.ensureGoalBelongsToUser(dto.goalId, userId);

    const transaction = await this.prisma.transaction.update({
      where: { id },
      data: {
        direction: dto.direction,
        amountKobo:
          dto.amountKobo === undefined ? undefined : BigInt(dto.amountKobo),
        occurredAt:
          dto.occurredAt === undefined ? undefined : new Date(dto.occurredAt),
        goalId: dto.goalId,
        note: dto.note,
      },
    });

    return this.serializeTransaction(transaction);
  }

  async remove(userId: string, id: string) {
    await this.ensureTransactionBelongsToUser(id, userId);
    await this.prisma.transaction.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureGoalBelongsToUser(goalId: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) throw new NotFoundException('Goal not found');
  }

  private async ensureTransactionBelongsToUser(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
  }

  private serializeTransaction(transaction: {
    id: string;
    userId: string;
    goalId: string | null;
    amountKobo: bigint;
    direction: string;
    occurredAt: Date;
    note: string | null;
    createdAt: Date;
  }) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      goalId: transaction.goalId,
      amountKobo: Number(transaction.amountKobo),
      direction: transaction.direction,
      occurredAt: transaction.occurredAt,
      note: transaction.note,
      createdAt: transaction.createdAt,
    };
  }
}
