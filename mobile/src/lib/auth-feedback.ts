import { ApiError } from './api-error';

export const OTP_RESEND_COOLDOWN_MS = 60_000;

const fallbackMessages = {
  request: 'We could not send a code right now. Try again in a moment.',
  verify: 'We could not verify that code right now. Try again in a moment.',
  resend: 'We could not send another code right now. Try again in a moment.',
} as const;

export type AuthFeedbackAction = keyof typeof fallbackMessages;

export const getAuthErrorMessage = (
  error: unknown,
  action: AuthFeedbackAction,
) => {
  if (!(error instanceof ApiError)) {
    return fallbackMessages[action];
  }

  switch (error.message) {
    case 'Please wait before requesting another OTP.':
      return 'A code was just sent. Wait a moment, then request a new one.';
    case 'Too many OTP requests from this network. Try again later.':
      return 'Too many code requests came from this network. Try again later.';
    case 'Too many OTP requests from this device. Try again later.':
      return 'Too many code requests came from this device. Try again later.';
    case 'Too many OTP requests. Try again later.':
      return 'Too many code requests were made for this number. Try again later.';
    case 'OTP expired or not found':
      return 'That code expired or is no longer valid. Request a new one and try again.';
    case 'Invalid phone or code':
      return 'That code did not match this phone number. Check it and try again.';
    case 'Too many invalid OTP attempts. Request a new code.':
      return 'Too many incorrect codes were entered. Request a new code to continue.';
    case 'Too many invalid OTP attempts from this network. Try again later.':
      return 'Too many incorrect codes came from this network. Try again later.';
    case 'Too many invalid OTP attempts from this device. Try again later.':
      return 'Too many incorrect codes came from this device. Try again later.';
    case 'Unexpected network error':
      return 'We could not reach Stead right now. Check your connection and try again.';
    default:
      return error.message || fallbackMessages[action];
  }
};

export const formatCooldownLabel = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${totalSeconds}s`;
};
