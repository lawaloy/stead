import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

const DUPLICATE_HEADER_CSV = [
  'date,description,amount,type,type',
  '2026-09-02,Valid,100.25,expense',
].join('\n');

describe('TransactionsService duplicate-header CSV parse failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { findMany: jest.Mock; createMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      transaction: { findMany: jest.fn(), createMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces duplicate columns on preview instead of querying duplicates', async () => {
    await expect(
      service.previewImport('user_1', { csv: DUPLICATE_HEADER_CSV }),
    ).rejects.toThrow(
      new BadRequestException('CSV contains duplicate column names'),
    );

    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });

  it('surfaces duplicate columns on confirm instead of importing', async () => {
    await expect(
      service.confirmImport('user_1', {
        csv: DUPLICATE_HEADER_CSV,
        rowNumbers: [2],
      }),
    ).rejects.toThrow(
      new BadRequestException('CSV contains duplicate column names'),
    );

    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
