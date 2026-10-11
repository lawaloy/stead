import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService confirmImport selection gates', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: { createMany: jest.Mock };
    goal: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: { createMany: jest.fn() },
      goal: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  it('rejects a mixed valid and invalid selection without writing any rows', async () => {
    const csv = [
      'date,description,amount,type',
      'bad,Invalid,20,expense',
      '2026-09-02,Valid,100.25,expense',
    ].join('\n');

    const error = await service
      .confirmImport('user_1', { csv, rowNumbers: [2, 3] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Only valid rows from the current preview can be imported',
      details: { rowNumbers: [2] },
    });
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejects a missing-only selection without writing any rows', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-02,Valid,100.25,expense',
    ].join('\n');

    const error = await service
      .confirmImport('user_1', { csv, rowNumbers: [99] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Only valid rows from the current preview can be imported',
      details: { rowNumbers: [99] },
    });
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });
});
