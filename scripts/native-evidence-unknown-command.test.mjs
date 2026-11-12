import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { summarizeMaestro } from './native-evidence.mjs';

test('Maestro summaries label empty commands as unknown without publishing error payloads', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead maestro unknown '));
  const flow = join(directory, 'sign-in');
  mkdirSync(flow);
  try {
    writeFileSync(
      join(flow, 'commands.json'),
      JSON.stringify([
        {
          command: {},
          metadata: {
            sequenceNumber: 7,
            status: 'FAILED',
            duration: 1_200,
            error: { message: 'sensitive-otp-123456' },
          },
        },
      ]),
    );
    const [summary] = summarizeMaestro(directory);
    assert.equal(summary.failedCommands[0].type, 'unknown');
    assert.equal(summary.failedCommands[0].sequence, 7);
    assert.equal(summary.failedCommands[0].fieldId, undefined);
    assert.doesNotMatch(JSON.stringify(summary), /sensitive-otp|123456/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
