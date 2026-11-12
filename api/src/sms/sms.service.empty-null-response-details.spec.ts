import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';
import { OBSERVABILITY_METRICS } from '../observability/metrics';

describe('SmsService empty vs null provider response details', () => {
  let service: SmsService;
  let twilio: { sendMessage: jest.Mock };
  const originalFrom = process.env.TWILIO_FROM;

  beforeEach(async () => {
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
                TWILIO_FROM: '+14155550100',
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

    service = module.get(SmsService);
    process.env.TWILIO_FROM = '+14155550100';
  });

  afterEach(() => {
    if (originalFrom === undefined) {
      delete process.env.TWILIO_FROM;
    } else {
      process.env.TWILIO_FROM = originalFrom;
    }
  });

  it('keeps an empty-string provider response as details and falls through a null response to the Error message', async () => {
    twilio.sendMessage.mockRejectedValue({
      response: '',
      message: 'socket hang up',
    });

    await expect(
      service.sendOtp('+14155552671', '654321'),
    ).rejects.toMatchObject({
      response: {
        message: 'Failed to send OTP via Twilio',
        details: '',
      },
      status: HttpStatus.BAD_GATEWAY,
    });

    twilio.sendMessage.mockRejectedValue({
      response: null,
      message: 'socket hang up',
    });

    await expect(
      service.sendOtp('+14155552671', '654321'),
    ).rejects.toMatchObject({
      response: {
        message: 'Failed to send OTP via Twilio',
        details: 'socket hang up',
      },
      status: HttpStatus.BAD_GATEWAY,
    });
  });
});
