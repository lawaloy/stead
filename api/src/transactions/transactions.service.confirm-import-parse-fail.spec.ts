import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService confirmImport structural parse failure', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { createMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      transaction: { createMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };
    service = new TransactionsService(prisma as unknown as PrismaService);
  });

  it('surfaces a header-only CSV as a parse error instead of importing', async () => {
    await expect(
      service.confirmImport('user_1', {
        csv: 'date,description,amount,type',
        rowNumbers: [2],
      }),
    ).rejects.toThrow(new BadRequestException('CSV has no transaction rows'));

    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
  });
});
