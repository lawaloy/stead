import {
  generateRefreshFamilyId,
  generateRefreshToken,
  hashRefreshToken,
  parseDurationToMs,
  parseDurationToSeconds,
} from './refresh-token.util';

describe('refresh-token.util', () => {
  it('hashes refresh tokens with sha256 hex digests', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
    expect(hashRefreshToken('abc')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates opaque refresh tokens and family ids', () => {
    const first = generateRefreshToken();
    const second = generateRefreshToken();
    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(generateRefreshFamilyId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('parses common duration strings', () => {
    expect(parseDurationToMs('15m')).toBe(15 * 60_000);
    expect(parseDurationToMs('30d')).toBe(30 * 86_400_000);
    expect(parseDurationToSeconds('15m')).toBe(900);
  });

  it('parses second and hour units, trimming and ignoring case', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('1h')).toBe(3_600_000);
    expect(parseDurationToMs(' 15m ')).toBe(15 * 60_000);
    expect(parseDurationToMs('15M')).toBe(15 * 60_000);
    expect(parseDurationToMs('1H')).toBe(3_600_000);
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('1h')).toBe(3_600);
  });

  it('rejects unsupported duration strings', () => {
    expect(() => parseDurationToMs('15x')).toThrow('Unsupported duration');
  });
});
