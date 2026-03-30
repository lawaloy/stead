import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';

describe('SmsService', () => {
  let service: SmsService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = {
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: config,
        },
        {
          provide: TwilioClient,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
        {
          provide: TermiiClient,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails fast when the active provider is missing required env', () => {
    config.get.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        SMS_PROVIDER: 'termii',
        DEV_EXPOSE_OTP: 'false',
      };
      return env[key];
    });

    expect(() => service.onModuleInit()).toThrow(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });

  it('returns provider inspection without exposing secrets', () => {
    expect(service.getProviderInspection()).toEqual({
      provider: 'termii',
      ready: true,
      config: {
        apiKeyConfigured: true,
        senderIdConfigured: true,
        channel: 'generic',
      },
    });
  });
});
