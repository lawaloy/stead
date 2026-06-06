import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';

describe('SmsService', () => {
  let service: SmsService;
  let config: { get: jest.Mock };
  let devClient: { sendMessage: jest.Mock };

  beforeEach(async () => {
    devClient = {
      sendMessage: jest.fn(({ body }: { body: string }) => ({
        dev: true,
        logged: true,
        body,
      })),
    };
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
        {
          provide: DevClient,
          useValue: devClient,
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

  it('routes OTP delivery through the dev provider when configured', async () => {
    config.get.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        SMS_PROVIDER: 'dev',
        DEV_EXPOSE_OTP: 'true',
      };
      return env[key];
    });

    await expect(service.sendOtp('+15551234567', '123456')).resolves.toEqual({
      ok: true,
      provider: 'dev',
      response: {
        dev: true,
        logged: true,
        body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      },
    });
    expect(devClient.sendMessage).toHaveBeenCalledWith({
      to: '+15551234567',
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    });
  });

  it('reports dev provider inspection without requiring SMS secrets', () => {
    config.get.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        SMS_PROVIDER: 'dev',
        DEV_EXPOSE_OTP: 'true',
      };
      return env[key];
    });

    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getProviderInspection()).toEqual({
      provider: 'dev',
      ready: true,
      config: {
        exposeOtp: true,
      },
    });
  });
});
