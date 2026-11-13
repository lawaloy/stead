import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Termii whitespace sender at boot', () => {
  let service: SmsService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          SMS_PROVIDER: 'termii',
          TERMII_API_KEY: 'termii-key',
          TERMII_SENDER_ID: ' \t\n ',
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

  it('treats a whitespace-only ConfigService sender as missing at boot', () => {
    expect(service.getProviderInspection()).toEqual({
      provider: 'termii',
      ready: true,
      config: {
        apiKeyConfigured: true,
        senderIdConfigured: false,
        channel: 'generic',
      },
    });

    expect(() => service.onModuleInit()).toThrow(
      'TERMII_SENDER_ID is required when SMS_PROVIDER=termii',
    );
  });
});
