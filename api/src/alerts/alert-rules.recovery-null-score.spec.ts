import { riskDecision } from './alert-rules';

describe('riskDecision recovery without a notified score', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');

  it.each(['warning', 'critical'] as const)(
    'sends recovery from a status-only %s baseline even when lastNotifiedScore is null',
    (lastNotifiedStatus) => {
      expect(
        riskDecision(
          { status: 'stable', score: 72 },
          {
            lastNotifiedStatus,
            lastNotifiedScore: null,
            lastRiskAlertAt: now,
          },
          now,
        ),
      ).toBe('recovery');
    },
  );
});
