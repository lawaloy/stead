import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { TwilioClient } from './twilio.client';
import { TermiiClient } from './termii.client';
import { DevClient } from './dev.client';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, TwilioClient, TermiiClient, DevClient],
  exports: [SmsService],
})
export class SmsModule {}
