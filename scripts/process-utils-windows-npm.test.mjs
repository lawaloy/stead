import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommand } from './process-utils.mjs';

test('Windows npm without a pinned CLI path uses npm.cmd instead of a shell', () => {
  const command = resolveCommand('npm', ['ci'], {}, 'win32');

  assert.equal(command.command, 'npm.cmd');
  assert.deepEqual(command.args, ['ci']);
});

test('STEAD_NPM_CLI pins the Node CLI even when npm_execpath is also set', () => {
  const command = resolveCommand(
    'npm',
    ['--version'],
    {
      STEAD_NPM_CLI: '/pinned/npm-cli.js',
      npm_execpath: '/other/npm-cli.js',
    },
    'win32',
  );

  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args, ['/pinned/npm-cli.js', '--version']);
});
