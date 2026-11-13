import { EventEmitter } from 'events';
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
type MockRequest = EventEmitter & {
  write: jest.MockedFunction<(chunk: string) => void>;
  end: jest.MockedFunction<() => void>;
};
type MockRequestCallback = (response: MockResponse) => void;

const CONFIG_API_KEY = 'termii-config-api-key';
const WHITESPACE_API_KEY = ' \t\n ';

describe('SmsService Termii whitespace API key env vs config', () => {
  let service: SmsService;
  const processEnvKeys = [
    'TERMII_SENDER_ID',
    'TERMII_CHANNEL',
    'TERMII_API_KEY',
  ] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  const mockRequest = (statusCode: number, body: string) => {
    const req: MockRequest = Object.assign(new EventEmitter(), {
      write: jest.fn<void, [string]>(),
      end: jest.fn<void, []>(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        TermiiClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                SMS_PROVIDER: 'termii',
                TERMII_API_KEY: CONFIG_API_KEY,
                TERMII_SENDER_ID: 'STEAD',
                TERMII_CHANNEL: 'generic',
                DEV_EXPOSE_OTP: 'false',
              };
              return env[key];
            }),
          },
        },
        { provide: TwilioClient, useValue: { sendMessage: jest.fn() } },
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

  it('sends with a whitespace-only process.env API key even when inspection reports ConfigService is configured', async () => {
    process.env.TERMII_SENDER_ID = 'STEAD';
    process.env.TERMII_CHANNEL = 'generic';
    process.env.TERMII_API_KEY = WHITESPACE_API_KEY;
    const req = mockRequest(
      200,
      JSON.stringify({ message_id: 'termii-whitespace-api-key' }),
    );

    expect(service.getProviderInspection()).toEqual({
      provider: 'termii',
      ready: true,
      config: {
        apiKeyConfigured: true,
        senderIdConfigured: true,
        channel: 'generic',
      },
    });

    await expect(service.sendOtp('+2348012345678', '654321')).resolves.toEqual({
      ok: true,
      provider: 'termii',
      response: { message_id: 'termii-whitespace-api-key' },
    });
    const [[requestBody]] = req.write.mock.calls;
    expect(JSON.parse(requestBody)).toEqual({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      type: 'plain',
      channel: 'generic',
      api_key: WHITESPACE_API_KEY,
    });
    expect(https.request).toHaveBeenCalled();
  });
});
