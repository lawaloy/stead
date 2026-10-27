import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertStructuredRequestLog,
  initializeLocalEnvironment,
  renderApiEnvironment,
  testEnvironment,
} from './local-workflow.mjs';

test('structured process logs retain correlation without request secrets', () => {
  const output = `${JSON.stringify({
    message: 'HTTP request completed',
    requestId: 'request_1',
    method: 'GET',
    path: '/auth/countries',
    statusCode: 200,
    durationMs: 4,
  })}\n`;

  assert.doesNotThrow(() =>
    assertStructuredRequestLog(output, 'request_1', ['secret']),
  );
  assert.throws(
    () =>
      assertStructuredRequestLog(`${output}authorization=secret`, 'request_1', [
        'secret',
      ]),
    /forbidden value/u,
  );
});

const API_EXAMPLE = `DATABASE_URL="postgresql://localhost/stead"
JWT_SECRET="__REPLACE_ME__"
NOTIFICATION_PAYLOAD_ENCRYPTION_KEY="__REPLACE_ME__"
AUTH_DEVICE_IDENTIFIER_SECRET="__REPLACE_ME__"
`;

test('renderApiEnvironment replaces all placeholders with distinct secrets', () => {
  const secrets = ['jwt-secret', 'notification-secret', 'device-secret'];
  const rendered = renderApiEnvironment(API_EXAMPLE, () => secrets.shift());

  assert.doesNotMatch(rendered, /__REPLACE_ME__/);
  assert.match(rendered, /JWT_SECRET="jwt-secret"/);
  assert.match(
    rendered,
    /NOTIFICATION_PAYLOAD_ENCRYPTION_KEY="notification-secret"/,
  );
  assert.match(rendered, /AUTH_DEVICE_IDENTIFIER_SECRET="device-secret"/);
});

test('the repository API example stays compatible with secure generation', () => {
  const example = readFileSync(
    new URL('../api/.env.example', import.meta.url),
    'utf8',
  );
  const rendered = renderApiEnvironment(example);
  const generated = [
    'JWT_SECRET',
    'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY',
    'AUTH_DEVICE_IDENTIFIER_SECRET',
  ].map((name) => {
    const value = rendered.match(new RegExp(`^${name}="([^"]+)"$`, 'm'))?.[1];
    assert.ok(value, `${name} must be present`);
    assert.ok(
      value.length >= 32,
      `${name} must contain at least 32 characters`,
    );
    return value;
  });

  assert.equal(new Set(generated).size, generated.length);
  assert.doesNotMatch(rendered, /__REPLACE_ME__/);
});

test('testEnvironment replaces inherited database and port selectors', () => {
  const databaseUrl = 'postgresql://localhost/stead?schema=e2e';
  const environment = testEnvironment(databaseUrl, {
    DATABASE_URL: 'postgresql://localhost/stead?schema=public',
    E2E_DATABASE_URL: 'postgresql://localhost/stead?schema=e2e_other',
    PORT: '4999',
    PRESERVED_SETTING: 'preserved',
  });

  assert.equal(environment.DATABASE_URL, databaseUrl);
  assert.equal(environment.E2E_DATABASE_URL, undefined);
  assert.equal(environment.PORT, '3000');
  assert.equal(environment.PRESERVED_SETTING, 'preserved');
});

test('initializeLocalEnvironment creates missing files without overwriting them', () => {
  const root = mkdtempSync(join(tmpdir(), 'stead-local-workflow-'));
  const apiDir = join(root, 'api');
  const mobileDir = join(root, 'mobile');
  mkdirSync(apiDir);
  mkdirSync(mobileDir);
  writeFileSync(join(apiDir, '.env.example'), API_EXAMPLE);
  writeFileSync(
    join(mobileDir, '.env.example'),
    'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
  );

  try {
    const secrets = ['jwt-secret', 'notification-secret', 'device-secret'];
    const first = initializeLocalEnvironment(root, () => secrets.shift());
    assert.deepEqual(first, { apiCreated: true, mobileCreated: true });

    const apiEnvironment = readFileSync(join(apiDir, '.env'), 'utf8');
    assert.doesNotMatch(apiEnvironment, /__REPLACE_ME__/);
    assert.equal(
      readFileSync(join(mobileDir, '.env'), 'utf8'),
      'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
    );

    writeFileSync(join(apiDir, '.env'), 'KEEP_API=true\n');
    writeFileSync(join(mobileDir, '.env'), 'KEEP_MOBILE=true\n');
    const second = initializeLocalEnvironment(root);
    assert.deepEqual(second, { apiCreated: false, mobileCreated: false });
    assert.equal(readFileSync(join(apiDir, '.env'), 'utf8'), 'KEEP_API=true\n');
    assert.equal(
      readFileSync(join(mobileDir, '.env'), 'utf8'),
      'KEEP_MOBILE=true\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
