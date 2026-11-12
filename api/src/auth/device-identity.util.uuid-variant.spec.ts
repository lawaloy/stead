import { BadRequestException } from '@nestjs/common';
import { hashDeviceIdentifier } from './device-identity.util';

describe('device identity UUID version and variant gates', () => {
  const secret = 'test-device-identifier-secret-1234567890';

  it('rejects UUID versions other than 4 and RFC 4122 variants outside 8-b', () => {
    for (const deviceId of [
      '0f81c2a7-1e6d-1f05-91a1-03de8a5f6b77',
      '0f81c2a7-1e6d-5f05-91a1-03de8a5f6b77',
      '0f81c2a7-1e6d-4f05-c1a1-03de8a5f6b77',
      '0f81c2a7-1e6d-4f05-d1a1-03de8a5f6b77',
      '0f81c2a7-1e6d-4f05-71a1-03de8a5f6b77',
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
