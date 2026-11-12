import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService process.env SMS_PROVIDER ignore', () => {
  let service: SmsService;
  let twilio: { sendMessage: jest.Mock };
  let dev: { sendMessage: jest.Mock };
  const processEnvKeys = ['SMS_PROVIDER', 'TWILIO_FROM'] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  const compile = async (configEnv: Record<string, string>) => {
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
    twilio = { sendMessage: jest.fn() };
    dev = { sendMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configEnv[key]),
          },
        },
        { provide: TwilioClient, useValue: twilio },
        { provide: TermiiClient, useValue: { sendMessage: jest.fn() } },
        { provide: DevClient, useValue: dev },
        {
          provide: OBSERVABILITY_METRICS,
          useValue: { recordProviderRequest: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
  };

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

  it('routes through Twilio when ConfigService omits SMS_PROVIDER even if process.env is dev', async () => {
    await compile({
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      TWILIO_FROM: '+14155550100',
      DEV_EXPOSE_OTP: 'false',
    });
    process.env.SMS_PROVIDER = 'dev';
    process.env.TWILIO_FROM = '+14155550100';
    twilio.sendMessage.mockResolvedValue({ sid: 'SM-config-twilio' });

    expect(service.getProviderInspection()).toMatchObject({
      provider: 'twilio',
      ready: true,
    });

    await expect(service.sendOtp('+14155552671', '654321')).resolves.toEqual({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM-config-twilio' },
    });
    expect(twilio.sendMessage).toHaveBeenCalledTimes(1);
    expect(dev.sendMessage).not.toHaveBeenCalled();
  });

  it('routes through the local client when ConfigService is dev even if process.env is twilio', async () => {
    await compile({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
    });
    process.env.SMS_PROVIDER = 'twilio';
    process.env.TWILIO_FROM = '+14155550100';
    dev.sendMessage.mockReturnValue({ dev: true });

    expect(service.getProviderInspection()).toEqual({
      provider: 'dev',
      ready: true,
      config: { exposeOtp: true },
    });

    await expect(service.sendOtp('+14155552671', '654321')).resolves.toEqual({
      ok: true,
      provider: 'dev',
      response: { dev: true },
    });
    expect(dev.sendMessage).toHaveBeenCalledTimes(1);
    expect(twilio.sendMessage).not.toHaveBeenCalled();
  });
});
