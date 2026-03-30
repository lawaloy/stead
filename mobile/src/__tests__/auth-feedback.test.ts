import { ApiError } from '../lib/api-error';
import {
  formatCooldownLabel,
  getAuthErrorMessage,
} from '../lib/auth-feedback';

describe('auth-feedback', () => {
  it('maps auth api errors to clearer request copy', () => {
    const message = getAuthErrorMessage(
      new ApiError({
        message: 'Too many OTP requests from this network. Try again later.',
        status: 429,
      }),
      'request',
    );

    expect(message).toBe(
      'Too many code requests came from this network. Try again later.',
    );
  });

  it('maps verification lockout copy', () => {
    const message = getAuthErrorMessage(
      new ApiError({
        message: 'Too many invalid OTP attempts. Request a new code.',
        status: 429,
      }),
      'verify',
    );

    expect(message).toBe(
      'Too many incorrect codes were entered. Request a new code to continue.',
    );
  });

  it('falls back for non-api errors', () => {
    expect(getAuthErrorMessage(new Error('boom'), 'resend')).toBe(
      'We could not send another code right now. Try again in a moment.',
    );
  });

  it('formats resend cooldown labels in seconds', () => {
    expect(formatCooldownLabel(31_200)).toBe('32s');
  });
});
