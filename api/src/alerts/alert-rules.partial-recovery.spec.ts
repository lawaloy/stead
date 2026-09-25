import { riskDecision } from './alert-rules';

describe('riskDecision partial status recovery', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');

  it('does not alert when status improves from critical to warning without a score-drop', () => {
    expect(
      riskDecision(
        { status: 'warning', score: 45 },
        {
          lastNotifiedStatus: 'critical',
          lastNotifiedScore: 30,
          lastRiskAlertAt: new Date('2026-09-05T10:00:00.000Z'),
        },
        now,
      ),
    ).toBeNull();
  });
});
