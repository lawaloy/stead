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
      env: { ...process.env, STEAD_TEST_API_PORT: String(port) },
    },
  );

test('the isolated journey refuses privileged and overflow API ports before starting services', async () => {
  for (const port of [0, 80, 443, 1023, 65536, 99999, '08', '-1', '3000.5'])
    await assert.rejects(
      loadWorkflow(port),
      /STEAD_TEST_API_PORT must be an integer between 1024 and 65535/,
    );
  await loadWorkflow(1024);
  await loadWorkflow(3000);
  await loadWorkflow(65535);
});
