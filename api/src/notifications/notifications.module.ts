import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OperatorGuard } from '../auth/operator.guard';
import { SmsModule } from '../sms/sms.module';
import { NotificationConsumerService } from './notification-consumer.service';
import { NOTIFICATION_PUBLISHER } from './notification-publisher';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { QueuedNotificationPublisher } from './queued-notification.publisher';

@Module({
  imports: [SmsModule],
  controllers: [NotificationsController],
  providers: [
    JwtAuthGuard,
    OperatorGuard,
    NotificationQueueService,
    NotificationConsumerService,
    NotificationsService,
    QueuedNotificationPublisher,
    {
      provide: NOTIFICATION_PUBLISHER,
      useExisting: QueuedNotificationPublisher,
    },
  ],
  exports: [NOTIFICATION_PUBLISHER],
})
export class NotificationsModule {}
