import { HttpException, HttpStatus } from '@nestjs/common';
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
  const processEnvKeys = [
    'TWILIO_FROM',
    'TWILIO_MESSAGING_SERVICE_SID',
    'TERMII_SENDER_ID',
    'TERMII_CHANNEL',
  ] as const;
  const originalProcessEnv = Object.fromEntries(
    processEnvKeys.map((key) => [key, process.env[key]]),
  );

  const useConfig = (env: Record<string, string>) => {
    config.get.mockImplementation((key: string) => env[key]);
  };

  const clearSenderProcessEnv = () => {
    for (const key of processEnvKeys) {
      delete process.env[key];
    }
  };

  beforeEach(async () => {
    clearSenderProcessEnv();
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('fails fast when the active provider is missing required env', () => {
    useConfig({
      SMS_PROVIDER: 'termii',
      DEV_EXPOSE_OTP: 'false',
    });

    expect(() => service.onModuleInit()).toThrow(
      'TERMII_API_KEY is required when SMS_PROVIDER=termii',
    );
  });

  it('fails fast when Twilio is missing account credentials or sender identity', () => {
    useConfig({
      SMS_PROVIDER: 'twilio',
      DEV_EXPOSE_OTP: 'false',
    });
    expect(() => service.onModuleInit()).toThrow(
      'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
    );

    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      DEV_EXPOSE_OTP: 'false',
    });
    expect(() => service.onModuleInit()).toThrow(
      'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
    );

    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      DEV_EXPOSE_OTP: 'false',
    });
    expect(() => service.onModuleInit()).toThrow(
      'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
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

  it('reports Twilio inspection flags without leaking secret values', () => {
    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: '   ',
      TWILIO_FROM: '+14155550100',
      DEV_EXPOSE_OTP: 'false',
    });

    expect(service.getProviderInspection()).toEqual({
      provider: 'twilio',
      ready: true,
      config: {
        accountSidConfigured: true,
        authTokenConfigured: false,
        fromConfigured: true,
        messagingServiceSidConfigured: false,
      },
    });
  });

  it('initializes the dev provider without third-party SMS credentials', () => {
    useConfig({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'false',
    });

    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('routes dev provider OTPs through the local client only', async () => {
    useConfig({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
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
    useConfig({
      SMS_PROVIDER: 'dev',
      DEV_EXPOSE_OTP: 'true',
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

  it('sends OTP via Twilio using MessagingServiceSid when From is unset', async () => {
    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      TWILIO_MESSAGING_SERVICE_SID: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      DEV_EXPOSE_OTP: 'false',
    });
    process.env.TWILIO_MESSAGING_SERVICE_SID =
      'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    twilio.sendMessage.mockResolvedValue({ sid: 'SM123' });

    await expect(service.sendOtp('+14155552671', '654321')).resolves.toEqual({
      ok: true,
      provider: 'twilio',
      response: { sid: 'SM123' },
    });
    expect(twilio.sendMessage).toHaveBeenCalledWith({
      to: '+14155552671',
      body: 'Your Stead OTP is 654321. It expires in 10 minutes.',
      from: undefined,
      messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    expect(termii.sendMessage).not.toHaveBeenCalled();
    expect(dev.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects Twilio OTP sends when neither From nor MessagingServiceSid is set', async () => {
    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      DEV_EXPOSE_OTP: 'false',
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

  it('wraps Twilio provider failures as BAD_GATEWAY with details', async () => {
    useConfig({
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      TWILIO_FROM: '+14155550100',
      DEV_EXPOSE_OTP: 'false',
    });
    process.env.TWILIO_FROM = '+14155550100';
    const providerError = Object.assign(new Error('Twilio API error 400'), {
      response: { code: 21211, message: 'Invalid To phone number' },
    });
    twilio.sendMessage.mockRejectedValue(providerError);

    await expect(service.sendOtp('+14155552671', '654321')).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.sendOtp('+14155552671', '654321'),
    ).rejects.toMatchObject({
      response: {
        message: 'Failed to send OTP via Twilio',
        details: { code: 21211, message: 'Invalid To phone number' },
      },
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  it('sends OTP via Termii with the configured sender and default channel', async () => {
    useConfig({
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii-key',
      TERMII_SENDER_ID: 'STEAD',
      DEV_EXPOSE_OTP: 'false',
    });
    process.env.TERMII_SENDER_ID = 'STEAD';
    termii.sendMessage.mockResolvedValue({ message_id: 'termii-1' });

    await expect(service.sendOtp('+2348012345678', '123456')).resolves.toEqual({
      ok: true,
      provider: 'termii',
      response: { message_id: 'termii-1' },
    });
    expect(termii.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      channel: 'generic',
    });
    expect(twilio.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects Termii OTP sends when TERMII_SENDER_ID is missing at send time', async () => {
    useConfig({
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii-key',
      TERMII_SENDER_ID: 'STEAD',
      DEV_EXPOSE_OTP: 'false',
    });

    await expect(service.sendOtp('+2348012345678', '123456')).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.sendOtp('+2348012345678', '123456'),
    ).rejects.toMatchObject({
      message: 'Set TERMII_SENDER_ID',
      status: HttpStatus.BAD_REQUEST,
    });
    expect(termii.sendMessage).not.toHaveBeenCalled();
  });

  it('wraps Termii provider failures as BAD_GATEWAY with details', async () => {
    useConfig({
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'termii-key',
      TERMII_SENDER_ID: 'STEAD',
      TERMII_CHANNEL: 'dnd',
      DEV_EXPOSE_OTP: 'false',
    });
    process.env.TERMII_SENDER_ID = 'STEAD';
    process.env.TERMII_CHANNEL = 'dnd';
    const providerError = Object.assign(new Error('Termii API error 400'), {
      response: { message: 'Insufficient balance' },
    });
    termii.sendMessage.mockRejectedValue(providerError);

    await expect(service.sendOtp('+2348012345678', '123456')).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.sendOtp('+2348012345678', '123456'),
    ).rejects.toMatchObject({
      response: {
        message: 'Failed to send OTP via Termii',
        details: { message: 'Insufficient balance' },
      },
      status: HttpStatus.BAD_GATEWAY,
    });
    expect(termii.sendMessage).toHaveBeenCalledWith({
      to: '+2348012345678',
      from: 'STEAD',
      sms: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      channel: 'dnd',
    });
  });
});
