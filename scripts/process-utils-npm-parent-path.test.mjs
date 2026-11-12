import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { runCommand, spawnOwned } from './process-utils.mjs';

test('spawnOwned falls back to the npm prefix when node_modules/.bin is missing', async () => {
  const prefix = mkdtempSync(join(tmpdir(), 'stead npm parent '));
  try {
    mkdirSync(join(prefix, 'node_modules', 'npm', 'bin'), { recursive: true });
    const cli = join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    writeFileSync(cli, 'console.log("unused")\n');
    writeFileSync(join(prefix, 'npm'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(prefix, 'npm'), 0o755);

    const inherited = {
      STEAD_NPM_CLI: cli,
      PATH: '/usr/bin',
    };
    const path = await runCommand(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.PATH)'],
      {
        quiet: true,
        stdoutOnly: true,
        env: inherited,
      },
    );

    assert.equal(path.split(delimiter)[0], prefix);
    assert.equal(inherited.PATH, '/usr/bin');
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
});

test('spawnOwned does not prepend PATH when the pinned npm layout has no npm binary', async () => {
  const prefix = mkdtempSync(join(tmpdir(), 'stead npm missing '));
  try {
    mkdirSync(join(prefix, 'node_modules', 'npm', 'bin'), { recursive: true });
    const cli = join(prefix, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    writeFileSync(cli, 'console.log("unused")\n');

    const inherited = {
      STEAD_NPM_CLI: cli,
      PATH: '/usr/bin',
    };
    const child = spawnOwned(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.PATH)'],
      { env: inherited, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const path = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.completion.then(() => resolve(output), reject);
    });

    assert.equal(path, '/usr/bin');
    assert.equal(inherited.PATH, '/usr/bin');
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
});
