import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly twilio: TwilioClient,
    private readonly termii: TermiiClient,
  ) {}

  onModuleInit() {
    const exposeOtp = this.config.get<string>('DEV_EXPOSE_OTP') === 'true';

    this.assertProviderConfiguration();
    this.logger.log(
      `SMS provider ready provider=${this.getProviderName()} exposeOtp=${String(exposeOtp)}`,
    );
  }

  async sendOtp(phone: string, otp: string) {
    const provider = this.getProviderName();

    const to = phone;
    const body = `Your Stead OTP is ${otp}. It expires in 10 minutes.`;

    if (provider === 'twilio') {
      const from = process.env.TWILIO_FROM;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!from && !messagingServiceSid) {
        throw new HttpException(
          'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        const response = await this.twilio.sendMessage({
          to,
          body,
          from,
          messagingServiceSid,
        });
        return { ok: true, provider: 'twilio', response };
      } catch (error: unknown) {
        const details = this.extractErrorDetails(error);
        throw new HttpException(
          { message: 'Failed to send OTP via Twilio', details },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    if (provider === 'termii') {
      const senderId = process.env.TERMII_SENDER_ID;
      const channel = process.env.TERMII_CHANNEL || 'generic';

      if (!senderId) {
        throw new HttpException('Set TERMII_SENDER_ID', HttpStatus.BAD_REQUEST);
      }

      try {
        const response = await this.termii.sendMessage({
          to,
          from: senderId,
          sms: body,
          channel,
        });
        return { ok: true, provider: 'termii', response };
      } catch (error: unknown) {
        const details = this.extractErrorDetails(error);
        throw new HttpException(
          { message: 'Failed to send OTP via Termii', details },
          HttpStatus.BAD_GATEWAY,
        );
      }
    }

    throw new HttpException(
      `Unsupported SMS provider: ${String(provider)}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  private extractErrorDetails(error: unknown) {
    if (error && typeof error === 'object') {
      const maybeError = error as { response?: unknown; message?: string };
      return maybeError.response ?? maybeError.message ?? 'Unknown error';
    }

    return 'Unknown error';
  }

  getProviderInspection() {
    const provider = this.getProviderName();

    if (provider === 'twilio') {
      return {
        provider,
        ready: true,
        config: {
          accountSidConfigured: this.hasValue('TWILIO_ACCOUNT_SID'),
          authTokenConfigured: this.hasValue('TWILIO_AUTH_TOKEN'),
          fromConfigured: this.hasValue('TWILIO_FROM'),
          messagingServiceSidConfigured: this.hasValue(
            'TWILIO_MESSAGING_SERVICE_SID',
          ),
        },
      };
    }

    return {
      provider,
      ready: true,
      config: {
        apiKeyConfigured: this.hasValue('TERMII_API_KEY'),
        senderIdConfigured: this.hasValue('TERMII_SENDER_ID'),
        channel: this.config.get<string>('TERMII_CHANNEL') || 'generic',
      },
    };
  }

  private assertProviderConfiguration() {
    const provider = this.getProviderName();

    if (provider === 'twilio') {
      if (!this.hasValue('TWILIO_ACCOUNT_SID')) {
        throw new Error(
          'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio',
        );
      }
      if (!this.hasValue('TWILIO_AUTH_TOKEN')) {
        throw new Error(
          'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio',
        );
      }
      if (
        !this.hasValue('TWILIO_FROM') &&
        !this.hasValue('TWILIO_MESSAGING_SERVICE_SID')
      ) {
        throw new Error(
          'Set TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID when SMS_PROVIDER=twilio',
        );
      }
      return;
    }

    if (!this.hasValue('TERMII_API_KEY')) {
      throw new Error('TERMII_API_KEY is required when SMS_PROVIDER=termii');
    }
    if (!this.hasValue('TERMII_SENDER_ID')) {
      throw new Error('TERMII_SENDER_ID is required when SMS_PROVIDER=termii');
    }
  }

  private getProviderName(): 'twilio' | 'termii' {
    const provider = (this.config.get<string>('SMS_PROVIDER') || 'twilio')
      .toLowerCase()
      .trim();
    return provider === 'termii' ? 'termii' : 'twilio';
  }

  private hasValue(key: string): boolean {
    const value = this.config.get<string>(key);
    return typeof value === 'string' && value.trim().length > 0;
  }
}
