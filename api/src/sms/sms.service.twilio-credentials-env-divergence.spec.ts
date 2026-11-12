import { EventEmitter } from 'events';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

jest.mock('https');

type MockResponse = EventEmitter & { statusCode: number };
type MockRequestCallback = (response: MockResponse) => void;

const CONFIG_ACCOUNT_SID = 'ACcccccccccccccccccccccccccccccccc';
const CONFIG_AUTH_TOKEN = 'twilio-config-token';
const ENV_ACCOUNT_SID = 'ACeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ENV_AUTH_TOKEN = 'twilio-env-token';

describe('SmsService Twilio credentials env vs config divergence', () => {
  let service: SmsService;
  let config: { get: jest.Mock };
  const processEnvKeys = [
    'TWILIO_FROM',
    'TWILIO_MESSAGING_SERVICE_SID',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
  ] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  const mockRequest = (statusCode: number, body: string) => {
    const req = Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(),
    });

    (https.request as jest.Mock).mockImplementation(
      (_options: unknown, callback: MockRequestCallback) => {
        const res = Object.assign(new EventEmitter(), { statusCode });
        callback(res);
        queueMicrotask(() => {
          res.emit('data', body);
          res.emit('end');
        });
        return req;
      },
    );

    return req;
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
    config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          SMS_PROVIDER: 'twilio',
          TWILIO_ACCOUNT_SID: CONFIG_ACCOUNT_SID,
          TWILIO_AUTH_TOKEN: CONFIG_AUTH_TOKEN,
          TWILIO_FROM: '+14155550100',
          DEV_EXPOSE_OTP: 'false',
        };
        return env[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        TwilioClient,
        { provide: ConfigService, useValue: config },
        { provide: TermiiClient, useValue: { sendMessage: jest.fn() } },
        { provide: DevClient, useValue: { sendMessage: jest.fn() } },
        {
          provide: OBSERVABILITY_METRICS,
          useValue: { recordProviderRequest: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  afterEach(() => {
    for (const key of processEnvKeys) {
      const value = originalProcessEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('fails closed when inspection reports ConfigService credentials but process.env has none', async () => {
    process.env.TWILIO_FROM = '+14155550100';

    expect(service.getProviderInspection()).toEqual({
      provider: 'twilio',
      ready: true,
      config: {
        accountSidConfigured: true,
        authTokenConfigured: true,
        fromConfigured: true,
        messagingServiceSidConfigured: false,
      },
    });

    await expect(
      service.sendOtp('+14155552671', '654321'),
    ).rejects.toMatchObject({
      response: {
        message: 'Failed to send OTP via Twilio',
        details: 'TWILIO_ACCOUNT_SID is not set',
      },
      status: HttpStatus.BAD_GATEWAY,
    });
    expect(https.request).not.toHaveBeenCalled();
  });

  it('sends with process.env credentials even when inspection reports ConfigService values', async () => {
    process.env.TWILIO_FROM = '+14155550100';
    process.env.TWILIO_ACCOUNT_SID = ENV_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = ENV_AUTH_TOKEN;
    mockRequest(201, JSON.stringify({ sid: 'SM-env-credentials' }));

    expect(service.getProviderInspection()).toEqual({
      provider: 'twilio',
      ready: true,
      config: {
        accountSidConfigured: true,
        authTokenConfigured: true,
        fromConfigured: true,
        messagingServiceSidConfigured: false,
      },
    });

    await expect(service.sendOtp('+14155552671', '654321')).resolves.toEqual({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM-env-credentials' },
    });
    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${ENV_ACCOUNT_SID}/Messages.json`,
        auth: `${ENV_ACCOUNT_SID}:${ENV_AUTH_TOKEN}`,
      }),
      expect.any(Function),
    );
    expect(https.request).not.toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/2010-04-01/Accounts/${CONFIG_ACCOUNT_SID}/Messages.json`,
      }),
      expect.any(Function),
    );
  });
});
