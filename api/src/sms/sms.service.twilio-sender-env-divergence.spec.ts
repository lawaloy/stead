import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService Twilio sender env vs config divergence', () => {
  let service: SmsService;
  let config: { get: jest.Mock };
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
    config = {
      get: jest.fn((key: string) => {
        const env: Record<string, string> = {
          SMS_PROVIDER: 'twilio',
          TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          TWILIO_AUTH_TOKEN: 'twilio-token',
          TWILIO_FROM: '+14155550100',
          DEV_EXPOSE_OTP: 'false',
        };
        return env[key];
      }),
    };
    twilio = { sendMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: ConfigService, useValue: config },
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

  it('rejects sends when inspection reports ConfigService From but process.env has no sender', async () => {
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

    await expect(service.sendOtp('+14155552671', '654321')).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.sendOtp('+14155552671', '654321'),
    ).rejects.toMatchObject({
      message: 'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID',
      status: HttpStatus.BAD_REQUEST,
    });
    expect(twilio.sendMessage).not.toHaveBeenCalled();
  });

  it('sends with the process.env From even when inspection reports a different ConfigService number', async () => {
    process.env.TWILIO_FROM = '+15555550199';
    twilio.sendMessage.mockResolvedValue({ sid: 'SM-env-from' });

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
      response: { sid: 'SM-env-from' },
    });
    expect(twilio.sendMessage).toHaveBeenCalledWith({
      to: '+14155552671',
      body: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      from: '+15555550199',
      messagingServiceSid: undefined,
    });
  });
});
