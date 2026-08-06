import { createClient } from '@hey-api/openapi-ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..');
const input = resolve(repositoryRoot, 'contracts', 'openapi.yaml');

await createClient({
  input,
  output: {
    path: resolve(apiDirectory, 'src', 'contracts', 'generated'),
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript'],
});

await createClient({
  input,
  output: {
    path: resolve(repositoryRoot, 'mobile', 'src', 'contracts', 'generated'),
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript', 'zod'],
});
