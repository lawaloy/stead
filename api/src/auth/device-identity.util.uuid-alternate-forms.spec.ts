import { BadRequestException } from '@nestjs/common';
import { hashDeviceIdentifier } from './device-identity.util';

describe('device identity alternate UUIDv4 representations', () => {
  const secret = 'test-device-identifier-secret-1234567890';
  const canonical = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

  it('rejects braced, URN, and unhyphenated UUIDv4 forms instead of hashing them', () => {
    for (const deviceId of [
      `{${canonical}}`,
      `urn:uuid:${canonical}`,
      canonical.replaceAll('-', ''),
    ]) {
      expect(() => hashDeviceIdentifier(deviceId, secret)).toThrow(
        BadRequestException,
      );
      expect(() => hashDeviceIdentifier(deviceId, secret)).toThrow(
        'X-Stead-Device-Id must be a valid UUIDv4 identifier',
      );
    }

    expect(hashDeviceIdentifier(canonical, secret)).toMatch(/^[0-9a-f]{64}$/);
  });
});
