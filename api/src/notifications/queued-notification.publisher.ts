import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service';
import type {
  NotificationPublisher,
  OtpRequestedPayload,
} from './notification-publisher';

@Injectable()
export class QueuedNotificationPublisher implements NotificationPublisher {
  constructor(private readonly queue: NotificationQueueService) {}

  async publishOtpRequested(payload: OtpRequestedPayload): Promise<void> {
    await this.queue.enqueueOtpRequested(payload);
  }
}
