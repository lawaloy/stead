import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, TwilioClient, TermiiClient],
  exports: [SmsService],
})
export class SmsModule {}
