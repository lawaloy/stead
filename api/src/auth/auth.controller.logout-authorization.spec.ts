import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OperatorGuard } from './operator.guard';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CountriesService } from '../countries/countries.service';

describe('AuthController logout authorization parsing', () => {
  let controller: AuthController;
  const authService = {
    revokeSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: AuthTelemetryService,
          useValue: { getInspection: jest.fn() },
        },
        {
          provide: CountriesService,
          useValue: { listAuthCountries: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OperatorGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
    jest.clearAllMocks();
  });

  it.each([
    ['missing', undefined],
    ['Basic', 'Basic dXNlcjpwYXNz'],
    ['bare Bearer scheme', 'Bearer'],
  ])(
    'does not forward an access token when Authorization is %s',
    (_label, authorization) => {
      const req = {
        get: jest.fn((header: string) =>
          header === 'authorization' ? authorization : undefined,
        ),
      };

      void controller.logoutSession(
        { refreshToken: 'refresh-token' },
        req as never,
      );

      expect(authService.revokeSession).toHaveBeenCalledWith({
        refreshToken: 'refresh-token',
        accessToken: undefined,
        allDevices: undefined,
      });
    },
  );
});
