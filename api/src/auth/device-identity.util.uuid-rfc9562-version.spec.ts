import { BadRequestException } from '@nestjs/common';
import { hashDeviceIdentifier } from './device-identity.util';

describe('device identity RFC 9562 UUID version gates', () => {
  const secret = 'test-device-identifier-secret-1234567890';

  it('rejects UUID versions 6, 7, and 8 instead of hashing them as v4', () => {
    for (const deviceId of [
      '0f81c2a7-1e6d-6f05-91a1-03de8a5f6b77',
      '0f81c2a7-1e6d-7f05-91a1-03de8a5f6b77',
      '0f81c2a7-1e6d-8f05-91a1-03de8a5f6b77',
    ]) {
      expect(() => hashDeviceIdentifier(deviceId, secret)).toThrow(
        BadRequestException,
      );
      expect(() => hashDeviceIdentifier(deviceId, secret)).toThrow(
        'X-Stead-Device-Id must be a valid UUIDv4 identifier',
      );
    }

    expect(
      hashDeviceIdentifier('0f81c2a7-1e6d-4f05-91a1-03de8a5f6b77', secret),
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
