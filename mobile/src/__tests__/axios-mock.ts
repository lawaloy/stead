import type { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';

type MockAdapterAxiosInstance = ConstructorParameters<typeof MockAdapter>[0];

/**
 * Axios exposes separate ESM and CommonJS declarations. axios-mock-adapter is CommonJS, so TypeScript treats its
 * AxiosInstance as nominally different from the ESM instance used by the app,
 * even though both declarations describe the same runtime object. This remains
 * necessary with Axios 1.20 under ts-jest's TypeScript 6 compiler.
 */
export const createAxiosMock = (client: AxiosInstance): MockAdapter =>
  new MockAdapter(client as unknown as MockAdapterAxiosInstance);
