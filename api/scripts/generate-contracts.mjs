import { createClient } from '@hey-api/openapi-ts';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'yaml';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..');
const input = resolve(repositoryRoot, 'contracts', 'openapi.yaml');
const contract = parse(await readFile(input, 'utf8'));
const prettierOptions = (await resolveConfig(input)) ?? {};

const lowerFirst = (value) => value.charAt(0).toLowerCase() + value.slice(1);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const requireIdentifier = (value, description) => {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${description} must be a JavaScript identifier: ${value}`);
  }
  return value;
};

const headerKeys = new Set();
const headerEntries = Object.entries(contract.components?.parameters ?? {})
  .filter(([, parameter]) => parameter?.in === 'header')
  .map(([key, parameter]) => {
    if (typeof parameter.name !== 'string' || !parameter.name) {
      throw new Error(`OpenAPI header parameter ${key} must have a name.`);
    }
    const generatedKey = requireIdentifier(
      lowerFirst(key),
      `OpenAPI header parameter ${key}`,
    );
    if (headerKeys.has(generatedKey)) {
      throw new Error(`Duplicate generated HTTP header key: ${generatedKey}`);
    }
    headerKeys.add(generatedKey);
    return [generatedKey, parameter.name];
  });

if (!headerEntries.some(([key]) => key === 'requestId')) {
  throw new Error('The OpenAPI contract must define RequestId as a header.');
}

const HTTP_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);

const operationIds = new Set();
const routeEntries = Object.entries(contract.paths ?? {}).flatMap(
  ([path, pathItem]) =>
    Object.entries(pathItem ?? {}).flatMap(([method, operation]) => {
      if (!HTTP_METHODS.has(method)) return [];
      if (
        typeof operation?.operationId !== 'string' ||
        !operation.operationId
      ) {
        throw new Error(
          `OpenAPI ${method.toUpperCase()} ${path} needs operationId.`,
        );
      }
      const operationId = operation.operationId;
      if (operationIds.has(operationId)) {
        throw new Error(`Duplicate OpenAPI operationId: ${operationId}`);
      }
      operationIds.add(operationId);
      const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) =>
        requireIdentifier(name, `Path parameter for ${operationId}`),
      );
      return [{ operationId, parameters, path }];
    }),
);

const objectSource = (entries) =>
  entries
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${value},`)
    .join('\n');

const routeSource = (typescript) =>
  objectSource(
    routeEntries.map(({ operationId, parameters, path }) => {
      if (!parameters.length) return [operationId, JSON.stringify(path)];
      const argumentsSource = parameters
        .map((name) => `${name}${typescript ? ': string' : ''}`)
        .join(', ');
      const pathSource = path.replace(
        /\{([^}]+)\}/g,
        '${encodeURIComponent($1)}',
      );
      return [operationId, `(${argumentsSource}) => \`${pathSource}\``];
    }),
  );

const typescriptRuntime = await format(
  `// This file is generated from contracts/openapi.yaml. Do not edit it directly.

export const HTTP_HEADERS = {
${objectSource(headerEntries.map(([key, value]) => [key, JSON.stringify(value)]))}
} as const;

export const API_ROUTES = {
${routeSource(true)}
} as const;
`,
  { ...prettierOptions, parser: 'typescript' },
);

const javascriptRuntime = await format(
  `// This file is generated from contracts/openapi.yaml. Do not edit it directly.

export const HTTP_HEADERS = Object.freeze({
${objectSource(headerEntries.map(([key, value]) => [key, JSON.stringify(value)]))}
});

export const API_ROUTES = Object.freeze({
${routeSource(false)}
});
`,
  { ...prettierOptions, parser: 'babel' },
);

const writeRuntimeContract = async (outputDirectory) => {
  await writeFile(
    resolve(outputDirectory, 'runtime.gen.ts'),
    typescriptRuntime,
    'utf8',
  );
};

await createClient({
  input,
  output: {
    path: resolve(apiDirectory, 'src', 'contracts', 'generated'),
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript'],
});
await writeRuntimeContract(
  resolve(apiDirectory, 'src', 'contracts', 'generated'),
);

await createClient({
  input,
  output: {
    path: resolve(repositoryRoot, 'mobile', 'src', 'contracts', 'generated'),
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript', 'zod'],
});
await writeRuntimeContract(
  resolve(repositoryRoot, 'mobile', 'src', 'contracts', 'generated'),
);

const automationOutput = resolve(repositoryRoot, 'contracts', 'generated');
await mkdir(automationOutput, { recursive: true });
await writeFile(
  resolve(automationOutput, 'runtime.gen.mjs'),
  javascriptRuntime,
  'utf8',
);
