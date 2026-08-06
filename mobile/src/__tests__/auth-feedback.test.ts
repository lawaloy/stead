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

  it('maps resend cooldown, phone hourly limit, and expired/invalid OTP copy', () => {
    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Please wait before requesting another OTP.',
          status: 429,
        }),
        'resend',
      ),
    ).toBe('A code was just sent. Wait a moment, then request a new one.');

    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Too many OTP requests. Try again later.',
          status: 429,
        }),
        'request',
      ),
    ).toBe('Too many code requests were made for this number. Try again later.');

    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'OTP expired or not found',
          status: 400,
        }),
        'verify',
      ),
    ).toBe(
      'That code expired or is no longer valid. Request a new one and try again.',
    );

    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Invalid phone or code',
          status: 400,
        }),
        'verify',
      ),
    ).toBe(
      'That code did not match this phone number. Check it and try again.',
    );
  });

  it('maps IP verify lockout and unexpected network errors', () => {
    expect(
      getAuthErrorMessage(
        new ApiError({
          message:
            'Too many invalid OTP attempts from this network. Try again later.',
          status: 429,
        }),
        'verify',
      ),
    ).toBe(
      'Too many incorrect codes came from this network. Try again later.',
    );

    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Unexpected network error',
          status: 0,
        }),
        'request',
      ),
    ).toBe(
      'We could not reach Stead right now. Check your connection and try again.',
    );
  });

  it('maps device request and verify lockouts', () => {
    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Too many OTP requests from this device. Try again later.',
          status: 429,
        }),
        'request',
      ),
    ).toBe('Too many code requests came from this device. Try again later.');

    expect(
      getAuthErrorMessage(
        new ApiError({
          message:
            'Too many invalid OTP attempts from this device. Try again later.',
          status: 429,
        }),
        'verify',
      ),
    ).toBe('Too many incorrect codes came from this device. Try again later.');
  });

  it('preserves unknown api messages and falls back when empty', () => {
    expect(
      getAuthErrorMessage(
        new ApiError({
          message: 'Custom upstream failure',
          status: 500,
        }),
        'verify',
      ),
    ).toBe('Custom upstream failure');

    expect(
      getAuthErrorMessage(
        new ApiError({
          message: '',
          status: 500,
        }),
        'request',
      ),
    ).toBe('We could not send a code right now. Try again in a moment.');
  });

  it('falls back for non-api errors', () => {
    expect(getAuthErrorMessage(new Error('boom'), 'resend')).toBe(
      'We could not send another code right now. Try again in a moment.',
    );
  });

  it('formats resend cooldown labels in seconds', () => {
    expect(formatCooldownLabel(31_200)).toBe('32s');
    expect(formatCooldownLabel(0)).toBe('0s');
    expect(formatCooldownLabel(-5_000)).toBe('0s');
  });
});
