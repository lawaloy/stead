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

const withPinnedNpm = (operation) => {
  const prefix = mkdtempSync(join(tmpdir(), 'stead npm path '));
  const modules = join(prefix, 'node_modules');
  const bin = join(modules, '.bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(modules, 'npm', 'bin'), { recursive: true });
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'npm'), 0o755);
  const cli = join(modules, 'npm', 'bin', 'npm-cli.js');
  writeFileSync(cli, 'console.log("unused")\n');
  return operation({ prefix, bin, cli }).finally(() =>
    rmSync(prefix, { recursive: true, force: true }),
  );
};

test('spawnOwned prepends the pinned npm .bin directory onto PATH without mutating the caller env', async () => {
  await withPinnedNpm(async ({ bin, cli }) => {
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
    assert.equal(path.split(delimiter)[0], bin);
    assert.equal(inherited.PATH, '/usr/bin');
    assert.equal(inherited.STEAD_NPM_CLI, cli);
  });
});

test('spawnOwned uses host Path when PATH is absent after pinning npm', async () => {
  await withPinnedNpm(async ({ bin, cli }) => {
    const path = await runCommand(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.PATH)'],
      {
        quiet: true,
        stdoutOnly: true,
        env: {
          STEAD_NPM_CLI: cli,
          Path: 'C:\\Windows',
        },
      },
    );
    assert.equal(path, `${bin}${delimiter}C:\\Windows`);
  });
});
