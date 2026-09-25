import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CountriesService } from '../countries/countries.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTelemetryService } from './auth-telemetry.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OperatorGuard } from './operator.guard';

describe('AuthController inspection limit pipe', () => {
  let app: INestApplication<App>;
  const telemetry = {
    getInspection: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { requestOtp: jest.fn(), verifyOtp: jest.fn() },
        },
        { provide: AuthTelemetryService, useValue: telemetry },
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

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    telemetry.getInspection.mockResolvedValue({ summary: {}, recent: [] });
  });

  it('rejects a non-numeric inspection limit before querying telemetry', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/inspection')
      .query({ limit: 'abc' })
      .expect(400);
    const body = response.body as { statusCode: number; message: string };

    expect(body.statusCode).toBe(400);
    expect(body.message).toMatch(/numeric/i);
    expect(telemetry.getInspection).not.toHaveBeenCalled();
  });
});
