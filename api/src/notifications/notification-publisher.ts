export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');

export interface OtpRequestedPayload {
  phone: string;
  otp: string;
}

export interface NotificationPublisher {
  publishOtpRequested(payload: OtpRequestedPayload): Promise<void>;
}
