import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';

@Module({
  providers: [SmsService, TwilioClient, TermiiClient],
  exports: [SmsService],
})
export class SmsModule {}
