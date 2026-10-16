import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSourceFormatting } from './format-check.mjs';
import { runCommand } from './process-utils.mjs';

test('source formatting catches tracked and untracked changes while respecting ignored tools and generated files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead source formatting '));
  const execute = (command, args, options) =>
    runCommand(command, args, { ...options, quiet: true });
  try {
    await execute('git', ['init', '--quiet'], { cwd: root });
    writeFileSync(join(root, '.gitignore'), 'tool-cache/\n');
    writeFileSync(join(root, '.prettierignore'), 'generated.json\n');
    writeFileSync(join(root, 'tracked.json'), '{"tracked":true}');
    await execute('git', ['add', 'tracked.json'], { cwd: root });
    await assert.rejects(checkSourceFormatting(root, execute), /tracked.json/);
    writeFileSync(join(root, 'tracked.json'), '{ "tracked": true }\n');
    writeFileSync(join(root, 'untracked.json'), '{"new":true}');
    await assert.rejects(
      checkSourceFormatting(root, execute),
      /untracked.json/,
    );
    writeFileSync(join(root, 'untracked.json'), '{ "new": true }\n');
    writeFileSync(join(root, 'generated.json'), 'not valid JSON');
    writeFileSync(join(root, 'Dockerfile'), 'FROM scratch\n');
    mkdirSync(join(root, 'tool-cache'));
    writeFileSync(join(root, 'tool-cache/bad.json'), 'not valid JSON');
    await checkSourceFormatting(root, execute);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
