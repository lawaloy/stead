import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Termii empty vs whitespace ConfigService channel', () => {
  let service: SmsService;
  let termii: { sendMessage: jest.Mock };
  const processEnvKeys = ['TERMII_SENDER_ID', 'TERMII_CHANNEL'] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  const compile = async (channel: string) => {
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
                TERMII_CHANNEL: channel,
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
  };

  beforeEach(() => {
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
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

  it('defaults an empty ConfigService channel in inspection and reports a whitespace-only channel as-is', async () => {
    process.env.TERMII_SENDER_ID = 'STEAD';

    await compile('');
    termii.sendMessage.mockResolvedValue({
      message_id: 'termii-empty-config-channel',
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
      response: { message_id: 'termii-empty-config-channel' },
    });
    expect(termii.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      channel: 'generic',
    });

    await compile(' \t\n ');
    termii.sendMessage.mockResolvedValue({
      message_id: 'termii-whitespace-config-channel',
    });

    expect(service.getProviderInspection()).toEqual({
      provider: 'termii',
      ready: true,
      config: {
        apiKeyConfigured: true,
        senderIdConfigured: true,
        channel: ' \t\n ',
      },
    });

    await expect(
      service.sendMessage('+2348012345678', 'Review your savings pace.'),
    ).resolves.toEqual({
      ok: true,
      provider: 'termii',
      response: { message_id: 'termii-whitespace-config-channel' },
    });
    expect(termii.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Review your savings pace.',
      channel: 'generic',
    });
  });
});
