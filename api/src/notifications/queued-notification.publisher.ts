import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service';
import type {
  LegacyOtpRequestInput,
  NotificationPublisher,
  OtpRequestedInput,
  ReadinessAlertInput,
} from './notification-publisher';

@Injectable()
export class QueuedNotificationPublisher implements NotificationPublisher {
  constructor(private readonly queue: NotificationQueueService) {}

  async publishOtpRequested(input: OtpRequestedInput): Promise<void> {
    await this.queue.enqueueOtpRequested(
      input.payload,
      input.userId,
      input.otpCodeId,
      input.dedupeKey,
    );
  }

  isOtpRequestEnqueued(dedupeKey: string, otpCodeId: string): Promise<boolean> {
    return this.queue.isOtpRequestEnqueued(dedupeKey, otpCodeId);
  }

  adoptLegacyOtpRequest(input: LegacyOtpRequestInput): Promise<boolean> {
    return this.queue.adoptLegacyOtpRequest(input);
  }

  publishReadinessAlert(input: ReadinessAlertInput): Promise<boolean> {
    return this.queue.enqueueReadinessAlert(input);
  }
}
