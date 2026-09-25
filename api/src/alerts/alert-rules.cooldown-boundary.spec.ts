import { RISK_COOLDOWN_MS, riskDecision } from './alert-rules';

describe('riskDecision cooldown boundary', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const deteriorated = { status: 'critical' as const, score: 20 };
  const baseline = (lastRiskAlertAt: Date) => ({
    lastNotifiedStatus: 'warning',
    lastNotifiedScore: 60,
    lastRiskAlertAt,
  });

  it('keeps suppression until the 24-hour cooldown elapses', () => {
    expect(
      riskDecision(
        deteriorated,
        baseline(new Date(now.getTime() - RISK_COOLDOWN_MS + 1)),
        now,
      ),
    ).toBeNull();
  });

  it('alerts again at exactly 24 hours after the last risk SMS', () => {
    expect(
      riskDecision(
        deteriorated,
        baseline(new Date(now.getTime() - RISK_COOLDOWN_MS)),
        now,
      ),
    ).toBe('risk');
  });

  it('alerts after the cooldown window has fully passed', () => {
    expect(
      riskDecision(
        deteriorated,
        baseline(new Date(now.getTime() - RISK_COOLDOWN_MS - 1)),
        now,
      ),
    ).toBe('risk');
  });
});
