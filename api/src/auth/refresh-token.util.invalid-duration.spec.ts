import {
  parseDurationToMs,
  parseDurationToSeconds,
} from './refresh-token.util';

describe('refresh-token.util unsupported duration strings', () => {
  it.each(['', '   ', '15 minutes', '90 days', '15 m', '15.5m', 'm', '7w'])(
    'rejects %p instead of coercing a lifetime',
    (value) => {
      expect(() => parseDurationToMs(value)).toThrow(
        `Unsupported duration: ${value}`,
      );
      expect(() => parseDurationToSeconds(value)).toThrow(
        `Unsupported duration: ${value}`,
      );
    },
  );

  it('parses a zero amount as an immediate expiry rather than the 15m/30d defaults', () => {
    expect(parseDurationToMs('0s')).toBe(0);
    expect(parseDurationToMs('0d')).toBe(0);
    expect(parseDurationToSeconds('0s')).toBe(0);
    expect(parseDurationToSeconds('0d')).toBe(0);
  });
});
