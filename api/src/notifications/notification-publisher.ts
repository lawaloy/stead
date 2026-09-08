export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');

export interface OtpRequestedPayload {
  phone: string;
  otp: string;
}

export type ReadinessAlertType =
  'weekly.summary' | 'risk.alert' | 'risk.recovery';

export interface ReadinessAlertPayload {
  phone: string;
  body: string;
}

export interface ReadinessAlertInput {
  type: ReadinessAlertType;
  payload: ReadinessAlertPayload;
  userId: string;
  goalId: string;
  dedupeKey: string;
}

export interface NotificationPublisher {
  publishOtpRequested(payload: OtpRequestedPayload): Promise<void>;
  publishReadinessAlert(input: ReadinessAlertInput): Promise<boolean>;
}
