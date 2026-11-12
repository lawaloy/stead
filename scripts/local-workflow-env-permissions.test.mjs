import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeLocalEnvironment } from './local-workflow.mjs';

const API_EXAMPLE = `DATABASE_URL="postgresql://localhost/stead"
JWT_SECRET="__REPLACE_ME__"
NOTIFICATION_PAYLOAD_ENCRYPTION_KEY="__REPLACE_ME__"
AUTH_DEVICE_IDENTIFIER_SECRET="__REPLACE_ME__"
AUTH_OTP_VERIFICATION_ENCRYPTION_KEY="__REPLACE_ME__"
`;

test(
  'initializeLocalEnvironment writes owner-only env files for generated secrets',
  { skip: process.platform === 'win32' },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'stead-local-env-mode-'));
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
      let n = 0;
      const created = initializeLocalEnvironment(
        root,
        () => `secret-${++n}-${'x'.repeat(24)}`,
      );
      assert.deepEqual(created, { apiCreated: true, mobileCreated: true });
      assert.equal(statSync(join(apiDir, '.env')).mode & 0o777, 0o600);
      assert.equal(statSync(join(mobileDir, '.env')).mode & 0o777, 0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
