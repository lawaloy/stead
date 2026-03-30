export type NotificationEventType = 'otp.requested';
export type NotificationJobStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'dead_letter';

export interface OtpRequestedPayload {
  phone: string;
  otp: string;
}

export interface NotificationJobBase<TPayload> {
  id: string;
  type: NotificationEventType;
  payload: TPayload;
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
  createdAt: Date;
  updatedAt: Date;
}

export type OtpRequestedJob = NotificationJobBase<OtpRequestedPayload> & {
  type: 'otp.requested';
};

export type NotificationJob = OtpRequestedJob;

export type DeadLetterNotificationJob = NotificationJob & {
  status: 'dead_letter';
  failedAt: Date;
  lastError: string;
};
