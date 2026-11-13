import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Twilio whitespace Messaging SID env vs config', () => {
  let service: SmsService;
  let twilio: { sendMessage: jest.Mock };
  const processEnvKeys = [
    'TWILIO_FROM',
    'TWILIO_MESSAGING_SERVICE_SID',
  ] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
    twilio = { sendMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                SMS_PROVIDER: 'twilio',
                TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                TWILIO_AUTH_TOKEN: 'twilio-token',
                TWILIO_MESSAGING_SERVICE_SID:
                  'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                DEV_EXPOSE_OTP: 'false',
              };
              return env[key];
            }),
          },
        },
        { provide: TwilioClient, useValue: twilio },
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

  it('forwards a whitespace-only process.env Messaging SID even when inspection reports ConfigService is configured', async () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = ' \t\n ';
    twilio.sendMessage.mockResolvedValue({ sid: 'SM-whitespace-sid' });

    expect(service.getProviderInspection()).toEqual({
      provider: 'twilio',
      ready: true,
      config: {
        accountSidConfigured: true,
        authTokenConfigured: true,
        fromConfigured: false,
        messagingServiceSidConfigured: true,
      },
    });

    await expect(service.sendOtp('+14155552671', '654321')).resolves.toEqual({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM-whitespace-sid' },
    });
    expect(twilio.sendMessage).toHaveBeenCalledWith({
      to: '+14155552671',
      body: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      from: undefined,
      messagingServiceSid: ' \t\n ',
    });
  });
});
