import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Termii empty channel env vs config', () => {
  let service: SmsService;
  let termii: { sendMessage: jest.Mock };
  const processEnvKeys = ['TERMII_SENDER_ID', 'TERMII_CHANNEL'] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
    termii = { sendMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                SMS_PROVIDER: 'termii',
                TERMII_API_KEY: 'termii-key',
                TERMII_SENDER_ID: 'STEAD',
                TERMII_CHANNEL: 'generic',
                DEV_EXPOSE_OTP: 'false',
              };
              return env[key];
            }),
          },
        },
        { provide: TwilioClient, useValue: { sendMessage: jest.fn() } },
        { provide: TermiiClient, useValue: termii },
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

  it('defaults an empty-string process.env channel to generic even when inspection reports ConfigService generic', async () => {
    process.env.TERMII_SENDER_ID = 'STEAD';
    process.env.TERMII_CHANNEL = '';
    termii.sendMessage.mockResolvedValue({
      message_id: 'termii-empty-channel',
    });

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
      response: { message_id: 'termii-empty-channel' },
    });
    expect(termii.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      channel: 'generic',
    });
  });
});
