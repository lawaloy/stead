import { Test, TestingModule } from '@nestjs/testing';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('GoalsController', () => {
  let controller: GoalsController;
  const goals = {
    create: jest.fn(),
    getActive: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [GoalsController],
      providers: [
        {
          provide: GoalsService,
          useValue: goals,
        },
      ],
    });

    const module: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GoalsController>(GoalsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('scopes create to the authenticated user id', () => {
    const dto = {
      name: 'Emergency fund',
      amountTotalKobo: 500_000_00,
      dueDate: '2026-12-31',
      monthlyIncomeKobo: 250_000_00,
    };
    const req = { user: { userId: 'user_1' } };

    void controller.create(req as never, dto);

    expect(goals.create).toHaveBeenCalledWith('user_1', dto);
  });

  it('scopes getActive to the authenticated user id', () => {
    const req = { user: { userId: 'user_1' } };

    void controller.getActive(req as never);

    expect(goals.getActive).toHaveBeenCalledWith('user_1');
  });

  it('scopes update to the authenticated user id and goal id', () => {
    const dto = { name: 'Updated goal' };
    const req = { user: { userId: 'user_1' } };

    void controller.update(req as never, 'goal_1', dto);

    expect(goals.update).toHaveBeenCalledWith('user_1', 'goal_1', dto);
  });
});
