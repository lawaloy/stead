import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from './process-utils.mjs';
import { ROOT } from './toolchain.mjs';

const workflow = pathToFileURL(join(ROOT, 'scripts/local-workflow.mjs')).href;

const loadWorkflow = (port) =>
  runCommand(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(workflow)})`],
    {
      cwd: ROOT,
      quiet: true,
      env: { ...process.env, STEAD_TEST_API_PORT: port },
    },
  );

test('the isolated journey defaults an empty STEAD_TEST_API_PORT and rejects whitespace-only values', async () => {
  await loadWorkflow('');
  await assert.rejects(
    loadWorkflow(' \t\n '),
    /STEAD_TEST_API_PORT must be an integer between 1024 and 65535/,
  );
});
