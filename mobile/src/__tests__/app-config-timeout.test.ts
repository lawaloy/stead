import { resolveApiTimeoutMs } from '../lib/app-config';

describe('API timeout configuration', () => {
  it('keeps the production default when no valid override is embedded', () => {
    expect(resolveApiTimeoutMs(undefined)).toBe(15_000);
    expect(resolveApiTimeoutMs('invalid')).toBe(15_000);
    expect(resolveApiTimeoutMs('999')).toBe(15_000);
    expect(resolveApiTimeoutMs('120001')).toBe(15_000);
  });

  it('accepts a bounded native-validation timeout', () => {
    expect(resolveApiTimeoutMs('60000')).toBe(60_000);
  });
});
