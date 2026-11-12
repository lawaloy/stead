import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeMaestro } from './native-evidence.mjs';

test('command summaries read elementSelector field ids without publishing input', () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'stead-native-element-selector-'),
  );
  try {
    const flow = join(directory, 'fill-goal');
    mkdirSync(flow);
    writeFileSync(
      join(flow, 'commands.json'),
      JSON.stringify([
        {
          command: {
            tapOnElement: {
              elementSelector: { idRegex: 'goal-target-input' },
              text: 'sensitive-input',
            },
          },
          metadata: {
            sequenceNumber: 4,
            status: 'FAILED',
            duration: 8_000,
          },
        },
      ]),
    );
    const [summary] = summarizeMaestro(directory);
    assert.equal(summary.failedCommands[0].type, 'tapOnElement');
    assert.equal(summary.failedCommands[0].fieldId, 'goal-target-input');
    assert.doesNotMatch(JSON.stringify(summary), /sensitive-input/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
