import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildProbePackageSpecs,
  combineSupportSignals,
  executeRuntimeProbe,
  runtimeProbeDefinitions,
  summarizeProbeFailure,
} = require('../.github/scripts/check-typescript-6-removal-readiness.cjs');

test('runtime candidates install every non-TypeScript peer explicitly', () => {
  const plugin = {
    packageName: '@typescript-eslint/eslint-plugin',
    peerDependencies: {
      '@typescript-eslint/parser': '^8.72.1',
      eslint: '^8.57.0 || ^9.0.0 || ^10.0.0',
      typescript: '>=7.1.0',
    },
    version: '8.72.1',
  };
  const specs = buildProbePackageSpecs('7.1.0', [plugin]);

  assert.deepEqual(specs, [
    'typescript@7.1.0',
    '@typescript-eslint/eslint-plugin@8.72.1',
    '@typescript-eslint/parser@^8.72.1',
    'eslint@^8.57.0 || ^9.0.0 || ^10.0.0',
  ]);
});

test('runtime incompatibility blocks removal despite a permissive peer range', () => {
  const result = combineSupportSignals({
    metadataReady: true,
    packageName: 'ts-node',
    range: '>=2.7',
    runtimeResult: {
      description: 'execute TypeScript',
      detail: "Cannot read properties of undefined (reading 'fileExists')",
      ready: false,
    },
    version: '10.9.2',
  });

  assert.equal(result.ready, false);
});

test('runtime success does not override an unsupported peer range', () => {
  const result = combineSupportSignals({
    metadataReady: false,
    packageName: 'example-tool',
    range: '<7',
    runtimeResult: {
      description: 'execute TypeScript',
      ready: true,
    },
    version: '1.0.0',
  });

  assert.equal(result.ready, false);
});

test('removal is ready only when metadata and runtime agree', () => {
  const result = combineSupportSignals({
    metadataReady: true,
    packageName: 'example-tool',
    range: '>=7.1',
    runtimeResult: {
      description: 'execute TypeScript',
      ready: true,
    },
    version: '2.0.0',
  });

  assert.equal(result.ready, true);
});

test('every tracked compiler API consumer has an executable probe', () => {
  assert.deepEqual(Object.keys(runtimeProbeDefinitions).sort(), [
    '@hey-api/openapi-ts',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    'ts-jest',
    'ts-loader',
    'ts-node',
    'typescript-eslint',
  ]);
});

test('runtime probes execute commands and preserve incompatibility details', () => {
  const probeRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'stead-readiness-test-'),
  );
  runtimeProbeDefinitions['test-success'] = {
    args: ['-e', "process.stdout.write('ready')"],
    description: 'successful fixture',
  };
  runtimeProbeDefinitions['test-failure'] = {
    args: ['-e', "throw new TypeError('compiler API unavailable')"],
    description: 'failing fixture',
  };

  try {
    assert.deepEqual(executeRuntimeProbe(probeRoot, 'test-success'), {
      description: 'successful fixture',
      ready: true,
    });

    const failure = executeRuntimeProbe(probeRoot, 'test-failure');
    assert.equal(failure.ready, false);
    assert.equal(failure.description, 'failing fixture');
    assert.match(failure.detail, /TypeError: compiler API unavailable/);
  } finally {
    delete runtimeProbeDefinitions['test-success'];
    delete runtimeProbeDefinitions['test-failure'];
    fs.rmSync(probeRoot, { force: true, recursive: true });
  }
});

test('probe failures report a concise actionable diagnostic', () => {
  const detail = summarizeProbeFailure({
    message: 'command failed',
    stderr: Buffer.from(
      "FAIL ./probe.test.ts\nTypeError: Cannot read properties of undefined (reading 'fileExists')\n    at internal frame",
    ),
  });

  assert.equal(
    detail,
    "TypeError: Cannot read properties of undefined (reading 'fileExists')",
  );
});
