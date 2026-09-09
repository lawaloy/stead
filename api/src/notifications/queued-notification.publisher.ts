import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service';
import type {
  NotificationPublisher,
  OtpRequestedInput,
  ReadinessAlertInput,
} from './notification-publisher';

@Injectable()
export class QueuedNotificationPublisher implements NotificationPublisher {
  constructor(private readonly queue: NotificationQueueService) {}

  async publishOtpRequested(input: OtpRequestedInput): Promise<void> {
    await this.queue.enqueueOtpRequested(input.payload, input.userId);
  }

  publishReadinessAlert(input: ReadinessAlertInput): Promise<boolean> {
    return this.queue.enqueueReadinessAlert(input);
  }
}
