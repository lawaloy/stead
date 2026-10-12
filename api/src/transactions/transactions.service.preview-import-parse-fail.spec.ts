import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService previewImport structural parse failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { findMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      transaction: { findMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces an empty CSV as a parse error instead of querying duplicates', async () => {
    await expect(service.previewImport('user_1', { csv: '' })).rejects.toThrow(
      new BadRequestException('CSV is empty'),
    );

    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });

  it('surfaces a header-only CSV as a parse error instead of querying duplicates', async () => {
    await expect(
      service.previewImport('user_1', {
        csv: 'date,description,amount,type',
      }),
    ).rejects.toThrow(new BadRequestException('CSV has no transaction rows'));

    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
