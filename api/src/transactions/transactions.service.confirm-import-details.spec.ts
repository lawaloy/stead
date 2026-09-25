import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService confirmImport error details', () => {
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

  it('returns missing and invalid row numbers in the structured error details', async () => {
    const csv = ['date,description,amount,type', 'bad,Invalid,20,expense'].join(
      '\n',
    );

    const error = await service
      .confirmImport('user_1', { csv, rowNumbers: [2, 8] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Only valid rows from the current preview can be imported',
      details: { rowNumbers: [8, 2] },
    });
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });
});
