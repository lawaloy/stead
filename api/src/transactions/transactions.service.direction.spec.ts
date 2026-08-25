import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransactionsService corrupt direction', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('fails closed when listing a row whose direction is not in or out', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx_corrupt',
        userId: 'user_1',
        goalId: null,
        amountKobo: 1_000n,
        direction: 'transfer',
        occurredAt: new Date('2026-01-02T00:00:00.000Z'),
        note: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await expect(service.list('user_1', {})).rejects.toThrow(
      'Unsupported transaction direction: transfer',
    );
  });
});
