import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes request metadata when requesting otp', () => {
    const req = {
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('jest-agent'),
    };

    controller.requestOtp(
      { phone: '08012345678', countryIso: 'NG' },
      req as never,
    );

    expect(authService.requestOtp).toHaveBeenCalledWith(
      '08012345678',
      'NG',
      {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
      },
    );
  });
});
