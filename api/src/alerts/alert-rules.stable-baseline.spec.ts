import { riskDecision } from './alert-rules';

describe('readiness alert rules stable baseline', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');

  it('does not send recovery when the seeded baseline is already stable', () => {
    expect(
      riskDecision(
        { status: 'stable', score: 90 },
        {
          lastNotifiedStatus: 'stable',
          lastNotifiedScore: 80,
          lastRiskAlertAt: null,
        },
        now,
      ),
    ).toBeNull();
  });
});
