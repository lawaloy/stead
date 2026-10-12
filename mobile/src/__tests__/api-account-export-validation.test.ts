import { createAxiosMock } from './axios-mock';
import { apiClient, exportAccountData } from '../lib/api';

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

const validExport = {
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

describe('account export client validation', () => {
  const mock = createAxiosMock(apiClient);
  afterEach(() => mock.reset());

  it('rejects an export transaction whose direction is not in or out', async () => {
    mock.onGet('/account/export').reply(200, {
      ...validExport,
      transactions: [
        {
          id: 'txn_1',
          goalId: null,
          amountKobo: 10_000,
          direction: 'transfer',
          occurredAt: '2026-09-08T12:00:00.000Z',
          note: 'Payday',
          createdAt: '2026-09-08T12:00:00.000Z',
        },
      ],
    });

    await expect(exportAccountData()).rejects.toThrow();
  });

  it('rejects an export transaction whose amountKobo is not an integer', async () => {
    mock.onGet('/account/export').reply(200, {
      ...validExport,
      transactions: [
        {
          id: 'txn_1',
          goalId: null,
          amountKobo: 10.5,
          direction: 'in',
          occurredAt: '2026-09-08T12:00:00.000Z',
          note: 'Payday',
          createdAt: '2026-09-08T12:00:00.000Z',
        },
      ],
    });

    await expect(exportAccountData()).rejects.toThrow();
  });
});
