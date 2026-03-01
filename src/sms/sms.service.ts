import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';

@Injectable()
export class SmsService {
  constructor(
    private readonly twilio: TwilioClient,
    private readonly termii: TermiiClient,
  ) {}

  async sendOtp(phone: string, otp: string) {
    const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();

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
      `Unsupported SMS provider: ${provider}`,
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
}
