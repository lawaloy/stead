import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from './notification-queue.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly queue: NotificationQueueService) {}

  enqueueOtpRequested(phone: string, otp: string): { ok: true } {
    void this.queue.enqueueOtpRequested({ phone, otp });
    return { ok: true };
  }
}
