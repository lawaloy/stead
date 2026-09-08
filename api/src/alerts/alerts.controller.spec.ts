import { AlertsController } from './alerts.controller';

describe('AlertsController', () => {
  const alerts = { getPreferences: jest.fn(), updatePreferences: jest.fn() };
  const controller = new AlertsController(alerts as never);
  const request = { user: { userId: 'user_1' } };

  beforeEach(() => jest.clearAllMocks());

  it('scopes preference reads and writes to the authenticated user', () => {
    const dto = { riskAlertsEnabled: true };
    void controller.getPreferences(request as never);
    void controller.updatePreferences(request as never, dto);
    expect(alerts.getPreferences).toHaveBeenCalledWith('user_1');
    expect(alerts.updatePreferences).toHaveBeenCalledWith('user_1', dto);
  });
});
