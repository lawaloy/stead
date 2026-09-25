import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OperatorGuard } from '../auth/operator.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController inspection limit pipe', () => {
  let app: INestApplication<App>;
  const notifications = {
    getInspection: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notifications }],
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
    notifications.getInspection.mockResolvedValue({
      provider: { provider: 'dev', ready: true, config: { exposeOtp: false } },
      jobs: { summary: {}, recent: [] },
    });
  });

  it('rejects a non-numeric inspection limit before listing jobs', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/inspection')
      .query({ limit: 'abc' })
      .expect(400);
    const body = response.body as { statusCode: number; message: string };

    expect(body.statusCode).toBe(400);
    expect(body.message).toMatch(/numeric/i);
    expect(notifications.getInspection).not.toHaveBeenCalled();
  });
});
