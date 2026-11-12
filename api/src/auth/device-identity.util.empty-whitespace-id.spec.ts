import { BadRequestException } from '@nestjs/common';
import { hashDeviceIdentifier } from './device-identity.util';

describe('device identity empty vs whitespace identifiers', () => {
  const secret = 'test-device-identifier-secret-1234567890';
  const canonical = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';

  it('treats an empty identifier as missing and rejects whitespace-only or padded UUIDv4 values', () => {
    expect(hashDeviceIdentifier('', secret)).toBeUndefined();
    expect(hashDeviceIdentifier('', undefined)).toBeUndefined();

    expect(() => hashDeviceIdentifier(' \t\n ', secret)).toThrow(
      BadRequestException,
    );
    expect(() => hashDeviceIdentifier(' \t\n ', secret)).toThrow(
      'X-Stead-Device-Id must be a valid UUIDv4 identifier',
    );
    expect(() => hashDeviceIdentifier(` ${canonical} `, secret)).toThrow(
      'X-Stead-Device-Id must be a valid UUIDv4 identifier',
    );

    expect(hashDeviceIdentifier(canonical, secret)).toMatch(/^[0-9a-f]{64}$/);
  });
});
