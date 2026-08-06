import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OperatorGuard } from './operator.guard';
import { AuthTelemetryService } from './auth-telemetry.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CountriesService } from '../countries/countries.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };
  const telemetryService = {
    getInspection: jest.fn(),
  };
  const countriesService = {
    listAuthCountries: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: AuthTelemetryService,
          useValue: telemetryService,
        },
        {
          provide: CountriesService,
          useValue: countriesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OperatorGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes request metadata when requesting otp', () => {
    const req = {
      ip: '127.0.0.1',
      get: jest.fn((header: string) =>
        header === 'user-agent'
          ? 'jest-agent'
          : '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      ),
    };

    void controller.requestOtp(
      { phone: '08012345678', countryIso: 'NG' },
      req as never,
    );

    expect(authService.requestOtp).toHaveBeenCalledWith('08012345678', 'NG', {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
      deviceId: '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
    });
  });

  it('passes request metadata when verifying otp', () => {
    const req = {
      ip: '127.0.0.1',
      get: jest.fn((header: string) =>
        header === 'user-agent'
          ? 'jest-agent'
          : '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      ),
    };

    void controller.verifyOtp(
      { phone: '08012345678', countryIso: 'NG', otp: '123456' },
      req as never,
    );

    expect(authService.verifyOtp).toHaveBeenCalledWith(
      '08012345678',
      'NG',
      '123456',
      {
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
        deviceId: '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77',
      },
    );
  });

  it('forwards undefined ip and user-agent when request metadata is absent', () => {
    const req = {
      ip: undefined,
      get: jest.fn().mockReturnValue(undefined),
    };

    void controller.requestOtp(
      { phone: '08012345678', countryIso: 'NG' },
      req as never,
    );
    void controller.verifyOtp(
      { phone: '08012345678', countryIso: 'NG', otp: '123456' },
      req as never,
    );

    expect(authService.requestOtp).toHaveBeenCalledWith('08012345678', 'NG', {
      ip: undefined,
      userAgent: undefined,
      deviceId: undefined,
    });
    expect(authService.verifyOtp).toHaveBeenCalledWith(
      '08012345678',
      'NG',
      '123456',
      {
        ip: undefined,
        userAgent: undefined,
        deviceId: undefined,
      },
    );
    expect(req.get).toHaveBeenCalledWith('user-agent');
    expect(req.get).toHaveBeenCalledWith('x-stead-device-id');
  });

  it('returns auth telemetry inspection', async () => {
    telemetryService.getInspection.mockResolvedValue({
      summary: { otp_requested: 1 },
      recent: [],
    });

    const result = await controller.getInspection(5);

    expect(telemetryService.getInspection).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      summary: { otp_requested: 1 },
      recent: [],
    });
  });

  it('returns auth country options', async () => {
    countriesService.listAuthCountries.mockResolvedValue([
      {
        iso: 'NG',
        label: 'Nigeria',
        dialCode: '+234',
        currencyCode: 'NGN',
        phoneExample: '08012345678',
        authEnabled: true,
        marketEnabled: true,
        defaultCountry: true,
      },
    ]);

    await expect(controller.getCountries()).resolves.toEqual({
      countries: [
        {
          iso: 'NG',
          label: 'Nigeria',
          dialCode: '+234',
          currencyCode: 'NGN',
          phoneExample: '08012345678',
          authEnabled: true,
          marketEnabled: true,
          defaultCountry: true,
        },
      ],
    });
  });
});
