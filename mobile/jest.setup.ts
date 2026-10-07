import {
  flushQueryClientNotifications,
  teardownTestQueryClient,
} from './src/__tests__/query-client-test-utils';

afterEach(async () => {
  await teardownTestQueryClient();
});

afterAll(async () => {
  await flushQueryClientNotifications();
});
