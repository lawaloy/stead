import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { TwilioClient } from './twilio.client';

@Injectable()
export class SmsService {
  constructor(private readonly twilio: TwilioClient) {}

  async sendOtp(phone: string, otp: string) {
    const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();
    if (provider !== 'twilio') {
      throw new HttpException(`Unsupported SMS provider: ${provider}`, HttpStatus.BAD_REQUEST);
    }

    const to = phone;
    const body = `Your Stead OTP is ${otp}. It expires in 10 minutes.`;
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
    } catch (error: any) {
      const details = error?.response ?? error?.message ?? 'Unknown error';
      throw new HttpException(
        { message: 'Failed to send OTP via Twilio', details },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
