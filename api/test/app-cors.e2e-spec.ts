import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://stead:stead@localhost:5432/stead?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stead-test-secret-12345';
process.env.SMS_PROVIDER = process.env.SMS_PROVIDER || 'dev';

describe('App CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('allows local web app preflight requests', () => {
    return request(app.getHttpServer())
      .options('/auth/request-otp')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('access-control-allow-origin', 'http://localhost:8081');
  });
});
