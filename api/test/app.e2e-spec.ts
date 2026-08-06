import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'stead-test-secret-12345';
process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY =
  process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ||
  'stead-test-notification-key-1234567890';
process.env.AUTH_DEVICE_IDENTIFIER_SECRET =
  process.env.AUTH_DEVICE_IDENTIFIER_SECRET ||
  'stead-test-device-identifier-key-1234567890';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
