import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  deleteAccount,
  exportAccountData,
  getAccount,
  updateAccountConsents,
  updateAccountProfile,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

const account = {
  profile: {
    id: 'user_1',
    phone: '+2348012345678',
    displayName: 'Ada',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  consents: {
    analyticsEnabled: false,
    productResearchEnabled: false,
    updatedAt: null,
  },
};

describe('account API client', () => {
  const mock = createAxiosMock(apiClient);
  afterEach(() => mock.reset());

  it('gets and updates validated account data', async () => {
    mock.onGet('/account').reply(200, account);
    await expect(getAccount()).resolves.toEqual(account);

    mock.onPatch('/account/profile').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({ displayName: 'Ada' });
      return [200, account];
    });
    await expect(updateAccountProfile({ displayName: 'Ada' })).resolves.toEqual(
      account,
    );

    mock.onPut('/account/consents').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        analyticsEnabled: true,
      });
      return [
        200,
        {
          ...account,
          consents: { ...account.consents, analyticsEnabled: true },
        },
      ];
    });
    await expect(
      updateAccountConsents({ analyticsEnabled: true }),
    ).resolves.toMatchObject({ consents: { analyticsEnabled: true } });
  });

  it('exports data and sends an explicit deletion confirmation', async () => {
    const exported = {
      schemaVersion: 1 as const,
      exportedAt: '2026-09-08T12:00:00.000Z',
      profile: account.profile,
      consents: account.consents,
      consentHistory: [],
      goals: [],
      transactions: [],
      alertPreferences: null,
      authHistory: [],
      notificationHistory: [],
    };
    mock.onGet('/account/export').reply(200, exported);
    await expect(exportAccountData()).resolves.toEqual(exported);

    mock.onDelete('/account').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        confirmation: 'DELETE',
      });
      return [200, { ok: true, deletedAt: '2026-09-08T12:01:00.000Z' }];
    });
    await expect(deleteAccount()).resolves.toMatchObject({ ok: true });
  });
});
