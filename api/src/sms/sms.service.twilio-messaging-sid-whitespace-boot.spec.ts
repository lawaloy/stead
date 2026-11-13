import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Twilio whitespace Messaging SID at boot', () => {
  let service: SmsService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          SMS_PROVIDER: 'twilio',
          TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          TWILIO_AUTH_TOKEN: 'twilio-token',
          TWILIO_MESSAGING_SERVICE_SID: ' \t\n ',
          DEV_EXPOSE_OTP: 'false',
        };
        return env[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: config },
        { provide: TwilioClient, useValue: { sendMessage: jest.fn() } },
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

  it('treats a whitespace-only ConfigService Messaging SID as missing at boot', () => {
    expect(service.getProviderInspection()).toEqual({
      provider: 'twilio',
      ready: true,
      config: {
        accountSidConfigured: true,
        authTokenConfigured: true,
        fromConfigured: false,
        messagingServiceSidConfigured: false,
      },
    });

    expect(() => service.onModuleInit()).toThrow(
      'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
    );
  });
});
