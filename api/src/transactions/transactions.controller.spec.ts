import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  const transactions = {
    create: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: transactions,
        },
      ],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('scopes create to the authenticated user id', () => {
    const dto = {
      direction: 'in' as const,
      amountKobo: 150_000,
      occurredAt: '2026-07-24T09:00:00.000Z',
      note: 'paycheck',
    };
    const req = { user: { userId: 'user_1' } };

    void controller.create(req as never, dto);

    expect(transactions.create).toHaveBeenCalledWith('user_1', dto);
  });

  it('scopes list to the authenticated user id and query', () => {
    const query = { limit: 20, cursor: 'tx_cursor' };
    const req = { user: { userId: 'user_1' } };

    void controller.list(req as never, query as never);

    expect(transactions.list).toHaveBeenCalledWith('user_1', query);
  });

  it('scopes update to the authenticated user id and transaction id', () => {
    const dto = { note: 'corrected note' };
    const req = { user: { userId: 'user_1' } };

    void controller.update(req as never, 'tx_1', dto);

    expect(transactions.update).toHaveBeenCalledWith('user_1', 'tx_1', dto);
  });

  it('scopes remove to the authenticated user id and transaction id', () => {
    const req = { user: { userId: 'user_1' } };

    void controller.remove(req as never, 'tx_1');

    expect(transactions.remove).toHaveBeenCalledWith('user_1', 'tx_1');
  });
});
