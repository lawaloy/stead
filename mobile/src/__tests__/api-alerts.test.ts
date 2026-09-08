import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  getAlertPreferences,
  updateAlertPreferences,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

describe('alerts API client', () => {
  const mock = createAxiosMock(apiClient);
  const preferences = {
    weeklySummaryEnabled: false,
    riskAlertsEnabled: true,
    channel: 'sms',
    timeZone: 'Africa/Lagos',
    weeklyDay: 1,
    weeklyHourLocal: 9,
    updatedAt: null,
  };

  afterEach(() => mock.reset());

  it('gets and updates validated preferences', async () => {
    mock.onGet('/alerts/preferences').reply(200, preferences);
    await expect(getAlertPreferences()).resolves.toEqual(preferences);

    mock.onPatch('/alerts/preferences').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        weeklySummaryEnabled: true,
      });
      return [200, { ...preferences, weeklySummaryEnabled: true }];
    });
    await expect(
      updateAlertPreferences({ weeklySummaryEnabled: true }),
    ).resolves.toMatchObject({ weeklySummaryEnabled: true });
  });
});
