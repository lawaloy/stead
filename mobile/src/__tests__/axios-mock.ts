import type { AxiosInstance } from 'axios';
import MockAdapter from 'axios-mock-adapter';

type MockAdapterAxiosInstance = ConstructorParameters<
  typeof MockAdapter
>[0];

/**
 * Axios 1.19 gives its ESM and CommonJS declarations distinct unique-symbol
 * defaults. axios-mock-adapter is CommonJS, so TypeScript treats its
 * AxiosInstance as nominally different from the ESM instance used by the app,
 * even though both declarations describe the same runtime object.
 */
export const createAxiosMock = (client: AxiosInstance): MockAdapter =>
  new MockAdapter(client as unknown as MockAdapterAxiosInstance);
