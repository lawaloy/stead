import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [SmsModule],
  providers: [
    NotificationQueueService,
    NotificationConsumerService,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
