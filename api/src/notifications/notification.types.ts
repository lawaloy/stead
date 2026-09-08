import type {
  OtpRequestedPayload,
  ReadinessAlertPayload,
  ReadinessAlertType,
} from './notification-publisher';

export type {
  OtpRequestedPayload,
  ReadinessAlertPayload,
  ReadinessAlertType,
} from './notification-publisher';

export type NotificationEventType = 'otp.requested' | ReadinessAlertType;
export type NotificationJobStatus =
  'pending' | 'processing' | 'sent' | 'failed' | 'dead_letter';

export interface RedactedNotificationPayload {
  phone: '<redacted>';
  redacted: true;
}

export interface NotificationJobBase<TType, TPayload> {
  id: string;
  type: TType;
  payload: TPayload | RedactedNotificationPayload;
  status: NotificationJobStatus;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  lockedAt?: Date | null;
  sentAt?: Date | null;
  failedAt?: Date | null;
  lastError?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  userId?: string | null;
  goalId?: string | null;
  dedupeKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpRequestedJob = NotificationJobBase<
  'otp.requested',
  OtpRequestedPayload
>;
export type ReadinessAlertJob = NotificationJobBase<
  ReadinessAlertType,
  ReadinessAlertPayload
>;
export type NotificationJob = OtpRequestedJob | ReadinessAlertJob;

export type DeadLetterNotificationJob = NotificationJob & {
  status: 'dead_letter';
  failedAt: Date;
  lastError: string;
};
