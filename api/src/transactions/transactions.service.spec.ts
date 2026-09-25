import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseTransactionImport } from './transaction-import.parser';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      createMany: jest.Mock;
    };
    goal: {
      findFirst: jest.Mock;
    };
  };

  const occurredAt = new Date('2026-01-02T03:04:05.000Z');
  const transactionRecord = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 12_500n,
    direction: 'out',
    occurredAt,
    note: 'Groceries',
    createdAt: new Date('2026-01-02T03:05:06.000Z'),
  };
  const serializedTransactionRecord = {
    ...transactionRecord,
    amountKobo: 12_500,
    occurredAt: transactionRecord.occurredAt.toISOString(),
    createdAt: transactionRecord.createdAt.toISOString(),
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        createMany: jest.fn(),
      },
      goal: {
        findFirst: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates transactions scoped to the authenticated user and owned goal', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.create.mockResolvedValue(transactionRecord);

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        goalId: 'goal_1',
        note: 'Groceries',
      }),
    ).resolves.toEqual({
      ...serializedTransactionRecord,
    });

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: 'goal_1',
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: 'Groceries',
      },
    });
  });

  it('rejects creating a transaction for another user goal', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 50_000,
        occurredAt: occurredAt.toISOString(),
        goalId: 'goal_2',
      }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('creates transactions without checking goal ownership when no goal is linked', async () => {
    const unlinked = { ...transactionRecord, goalId: null, note: null };
    prisma.transaction.create.mockResolvedValue(unlinked);

    await expect(
      service.create('user_1', {
        direction: 'in',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
      }),
    ).resolves.toEqual({
      ...serializedTransactionRecord,
      goalId: null,
      note: null,
    });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: null,
        direction: 'in',
        amountKobo: 12_500n,
        occurredAt,
        note: null,
      },
    });
  });

  it('lists only transactions belonging to the authenticated user within date filters', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(
      service.list('user_1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.000Z',
      }),
    ).resolves.toEqual([serializedTransactionRecord]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-01-31T23:59:59.000Z'),
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('lists user transactions without date bounds when filters are omitted', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(service.list('user_1', {})).resolves.toEqual([
      serializedTransactionRecord,
    ]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: undefined,
          lte: undefined,
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('applies only the supplied from bound when to is omitted', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(
      service.list('user_1', { from: '2026-01-01T00:00:00.000Z' }),
    ).resolves.toEqual([serializedTransactionRecord]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: undefined,
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('applies only the supplied to bound when from is omitted', async () => {
    prisma.transaction.findMany.mockResolvedValue([transactionRecord]);

    await expect(
      service.list('user_1', { to: '2026-01-31T23:59:59.000Z' }),
    ).resolves.toEqual([serializedTransactionRecord]);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        occurredAt: {
          gte: undefined,
          lte: new Date('2026-01-31T23:59:59.000Z'),
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('previews valid, duplicate, and invalid imported rows', async () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
      'bad,Invalid,20,expense',
      '2026-09-02,Food,50,debit',
    ].join('\n');
    const parsed = parseTransactionImport(csv);
    prisma.transaction.findMany.mockResolvedValue([
      { importFingerprint: parsed[0].fingerprint },
    ]);

    const preview = await service.previewImport('user_1', { csv });
    expect(preview).toMatchObject({
      readyCount: 1,
      duplicateCount: 1,
      invalidCount: 1,
      rows: [
        { rowNumber: 2, duplicate: true, error: null },
        { rowNumber: 3, duplicate: false },
        { rowNumber: 4, duplicate: false, error: null },
      ],
    });
    expect(typeof preview.rows[1].error).toBe('string');
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        importFingerprint: {
          in: [parsed[0].fingerprint, parsed[2].fingerprint],
        },
      },
      select: { importFingerprint: true },
    });
  });

  it('imports selected rows with owned goal linkage and database deduplication', async () => {
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.createMany.mockResolvedValue({ count: 1 });
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
      '2026-09-02,Food,50.25,expense',
    ].join('\n');
    const parsed = parseTransactionImport(csv);

    await expect(
      service.confirmImport('user_1', {
        csv,
        rowNumbers: [2, 3],
        goalId: 'goal_1',
      }),
    ).resolves.toEqual({ importedCount: 1, duplicateCount: 1 });
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user_1',
          goalId: 'goal_1',
          direction: 'in',
          amountKobo: 100_000n,
          note: 'Salary',
          importFingerprint: parsed[0].fingerprint,
        }),
        expect.objectContaining({
          direction: 'out',
          amountKobo: 5_025n,
          note: 'Food',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('reports no imports when every selected row is already stored', async () => {
    prisma.transaction.createMany.mockResolvedValue({ count: 0 });
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
      '2026-09-02,Food,50.25,expense',
    ].join('\n');

    await expect(
      service.confirmImport('user_1', { csv, rowNumbers: [2, 3] }),
    ).resolves.toEqual({ importedCount: 0, duplicateCount: 2 });
    expect(prisma.transaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('rejects invalid or nonexistent selected import rows before writing', async () => {
    const csv = ['date,description,amount,type', 'bad,Invalid,20,expense'].join(
      '\n',
    );

    await expect(
      service.confirmImport('user_1', { csv, rowNumbers: [2, 8] }),
    ).rejects.toThrow(
      'Only valid rows from the current preview can be imported',
    );
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejects preview and confirmation imports onto a goal the user does not own', async () => {
    prisma.goal.findFirst.mockResolvedValue(null);
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Salary,1000,income',
    ].join('\n');

    await expect(
      service.previewImport('user_1', { csv, goalId: 'goal_other' }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));
    await expect(
      service.confirmImport('user_1', {
        csv,
        rowNumbers: [2],
        goalId: 'goal_other',
      }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_other', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejects updating another user transaction before writing changes', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'tx_2', {
        amountKobo: 9_000,
      }),
    ).rejects.toThrow(new NotFoundException('Transaction not found'));

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects moving a transaction onto another user goal', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user_1', 'tx_1', {
        goalId: 'goal_2',
      }),
    ).rejects.toThrow(new NotFoundException('Goal not found'));

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_1', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'goal_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects deleting another user transaction before deleting', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(service.remove('user_1', 'tx_2')).rejects.toThrow(
      new NotFoundException('Transaction not found'),
    );

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: 'tx_2', userId: 'user_1' },
      select: { id: true },
    });
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('persists empty-string notes on update (unlike create which nulls them)', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      note: '',
    });

    await expect(
      service.update('user_1', 'tx_1', { note: '' }),
    ).resolves.toMatchObject({ note: '' });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: undefined,
        occurredAt: undefined,
        goalId: undefined,
        note: '',
      },
    });
  });

  it('updates an owned transaction after ownership checks pass', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.goal.findFirst.mockResolvedValue({ id: 'goal_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      note: 'corrected note',
      amountKobo: 9_000n,
    });

    await expect(
      service.update('user_1', 'tx_1', {
        amountKobo: 9_000,
        goalId: 'goal_1',
        note: 'corrected note',
      }),
    ).resolves.toEqual({
      ...serializedTransactionRecord,
      note: 'corrected note',
      amountKobo: 9_000,
    });

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: 9_000n,
        occurredAt: undefined,
        goalId: 'goal_1',
        note: 'corrected note',
      },
    });
  });

  it('unlinks a transaction from its goal when update sets goalId to null', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.update.mockResolvedValue({
      ...transactionRecord,
      goalId: null,
    });

    await expect(
      service.update('user_1', 'tx_1', { goalId: null }),
    ).resolves.toMatchObject({ goalId: null });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
      data: {
        direction: undefined,
        amountKobo: undefined,
        occurredAt: undefined,
        goalId: null,
        note: undefined,
      },
    });
  });

  it('deletes an owned transaction after ownership checks pass', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_1' });
    prisma.transaction.delete.mockResolvedValue(transactionRecord);

    await expect(service.remove('user_1', 'tx_1')).resolves.toEqual({
      ok: true,
    });

    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'tx_1' },
    });
  });

  it('persists empty notes and goal ids as null on create', async () => {
    const cleared = { ...transactionRecord, goalId: null, note: null };
    prisma.transaction.create.mockResolvedValue(cleared);

    await expect(
      service.create('user_1', {
        direction: 'out',
        amountKobo: 12_500,
        occurredAt: occurredAt.toISOString(),
        goalId: '',
        note: '',
      }),
    ).resolves.toEqual({
      ...serializedTransactionRecord,
      goalId: null,
      note: null,
    });

    expect(prisma.goal.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        goalId: null,
        direction: 'out',
        amountKobo: 12_500n,
        occurredAt,
        note: null,
      },
    });
  });
});
