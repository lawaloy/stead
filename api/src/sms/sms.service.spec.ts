import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';

describe('SmsService', () => {
  let service: SmsService;
  let config: { get: jest.Mock };
  let twilio: { sendMessage: jest.Mock };
  let termii: { sendMessage: jest.Mock };
  let dev: { sendMessage: jest.Mock };

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
    twilio = {
      sendMessage: jest.fn(),
    };
    termii = {
      sendMessage: jest.fn(),
    };
    dev = {
      sendMessage: jest.fn(),
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
          useValue: twilio,
        },
        {
          provide: TermiiClient,
          useValue: termii,
        },
        {
          provide: DevClient,
          useValue: dev,
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

  it('routes dev provider OTPs through the local client only', async () => {
    config.get.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        SMS_PROVIDER: 'dev',
        DEV_EXPOSE_OTP: 'true',
      };
      return env[key];
    });
    dev.sendMessage.mockReturnValue({
      dev: true,
      logged: true,
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    });

    await expect(service.sendOtp('+2348012345678', '123456')).resolves.toEqual({
      ok: true,
      provider: 'dev',
      response: {
        dev: true,
        logged: true,
        body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      },
    });
    expect(dev.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    });
    expect(twilio.sendMessage).not.toHaveBeenCalled();
    expect(termii.sendMessage).not.toHaveBeenCalled();
  });

  it('reports dev provider inspection with OTP exposure status', () => {
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
