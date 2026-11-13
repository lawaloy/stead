import { getDeviceReference } from './device-identity.util';

describe('device identity whitespace operator references', () => {
  it('treats whitespace-only hashes as bound while empty and missing stay unbound', () => {
    expect(getDeviceReference(' \t\n ')).toBe('device_ \t\n ');
    expect(getDeviceReference('')).toBeNull();
    expect(getDeviceReference(null)).toBeNull();
    expect(getDeviceReference(undefined)).toBeNull();
  });
});
