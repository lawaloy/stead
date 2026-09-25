import { riskDecision } from './alert-rules';

describe('riskDecision stable-band score erosion', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');

  it('does not alert when a 15-point drop stays inside the stable band', () => {
    expect(
      riskDecision(
        { status: 'stable', score: 70 },
        {
          lastNotifiedStatus: 'stable',
          lastNotifiedScore: 85,
          lastRiskAlertAt: null,
        },
        now,
      ),
    ).toBeNull();
  });
});
