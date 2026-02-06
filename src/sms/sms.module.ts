import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';

@Module({
  providers: [SmsService, TwilioClient],
  exports: [SmsService],
})
export class SmsModule {}
