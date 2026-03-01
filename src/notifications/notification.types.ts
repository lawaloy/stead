export type NotificationEventType = 'otp.requested';

export interface OtpRequestedPayload {
  phone: string;
  otp: string;
}

export interface NotificationJobBase<TPayload> {
  id: string;
  type: NotificationEventType;
  payload: TPayload;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpRequestedJob = NotificationJobBase<OtpRequestedPayload> & {
  type: 'otp.requested';
};

export type NotificationJob = OtpRequestedJob;

export interface DeadLetterNotificationJob extends NotificationJob {
  failedAt: Date;
  lastError: string;
}
