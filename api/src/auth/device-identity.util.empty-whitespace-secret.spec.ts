import { hashDeviceIdentifier } from './device-identity.util';

describe('device identity empty vs whitespace secrets', () => {
  const deviceId = '0f81c2a7-1e6d-4f05-9a1c-03de8a5f6b77';
  const realSecret = 'test-device-identifier-secret-1234567890';
  const whitespaceSecret = ' \t\n ';

  it('treats an empty device secret as missing and hashes with a whitespace-only secret', () => {
    expect(() => hashDeviceIdentifier(deviceId, '')).toThrow(
      'Auth device identifier secret is not configured',
    );

    const whitespaceHash = hashDeviceIdentifier(deviceId, whitespaceSecret);
    const realHash = hashDeviceIdentifier(deviceId, realSecret);

    expect(whitespaceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(realHash).toMatch(/^[0-9a-f]{64}$/);
    expect(whitespaceHash).not.toBe(realHash);
  });
});
