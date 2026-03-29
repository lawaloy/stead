import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SmsModule } from '../sms/sms.module';
import { NotificationConsumerService } from './notification-consumer.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [SmsModule],
  controllers: [NotificationsController],
  providers: [
    JwtAuthGuard,
    NotificationQueueService,
    NotificationConsumerService,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
