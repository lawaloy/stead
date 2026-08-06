import { BadRequestException } from '@nestjs/common';
import {
  getDeviceReference,
  hashDeviceIdentifier,
} from './device-identity.util';

describe('device identity utilities', () => {
  const secret = 'test-device-identifier-secret-1234567890';

  it('returns a stable keyed hash without retaining the raw identifier', () => {
    const deviceId = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
    const first = hashDeviceIdentifier(deviceId, secret);
    const second = hashDeviceIdentifier(deviceId.toUpperCase(), secret);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain(deviceId);
  });

  it('does not invent an identity for older clients without the header', () => {
    expect(hashDeviceIdentifier(undefined, undefined)).toBeUndefined();
  });

  it('rejects malformed or non-v4 identifiers', () => {
    expect(() => hashDeviceIdentifier('device-one', secret)).toThrow(
      BadRequestException,
    );
    expect(() =>
      hashDeviceIdentifier('0f81c2a7-1e6d-3f05-9a1c-03de8a5f6b77', secret),
    ).toThrow('X-Stead-Device-Id must be a valid UUIDv4 identifier');
  });

  it('fails closed when a present identifier cannot be keyed', () => {
    expect(() =>
      hashDeviceIdentifier('0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77', undefined),
    ).toThrow('Auth device identifier secret is not configured');
  });

  it('exposes only a short operator-safe device reference', () => {
    expect(getDeviceReference('abcdef0123456789')).toBe(
      'device_abcdef0123456789',
    );
    expect(getDeviceReference(null)).toBeNull();
  });
});
