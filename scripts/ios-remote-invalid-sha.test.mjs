import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteIos } from './ios-remote.mjs';

const feature = 'a'.repeat(40);

const remoteIosWith = (execute) => {
  const calls = [];
  return {
    calls,
    run: remoteIos({
      root: '/unused',
      iosEnabled: true,
      execute: async (command, args, options) => {
        calls.push({ command, args, options });
        return execute(command, args, options);
      },
      token: 'test',
      log: () => {},
      sleep: async () => {
        throw new Error('invalid SHAs must not wait for GitHub');
      },
      save: () => {
        throw new Error('invalid SHAs must not write evidence');
      },
    }),
  };
};

test('remote iOS preflight refuses an invalid HEAD SHA before uploading code', async () => {
  for (const sha of [
    'deadbeef',
    'A'.repeat(40),
    '',
    `${feature}x`,
    'not-a-git-sha-at-all-even-though-long!!',
  ]) {
    const { calls, run } = remoteIosWith(async (command, args) => {
      if (command === 'git') {
        if (args[0] === 'status') return '';
        if (args[0] === 'rev-parse') return sha;
      }
      throw new Error(`unexpected ${command} ${args.join(' ')}`);
    });

    await assert.rejects(run, /Git returned an invalid commit\/tree SHA/);
    assert.equal(
      calls.filter(({ command }) => command === 'gh').length,
      0,
      'a bad HEAD SHA must not talk to GitHub',
    );
    assert.ok(
      !calls.some(({ args }) => args.includes('push')),
      'a bad HEAD SHA must not push a validation ref',
    );
  }
});

test('remote iOS preflight refuses an invalid tree SHA before uploading code', async () => {
  const { calls, run } = remoteIosWith(async (command, args) => {
    if (command === 'git') {
      if (args[0] === 'status') return '';
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
      if (args[0] === 'rev-parse')
        return args[1].endsWith('^{tree}') ? 'not-a-tree-sha' : feature;
      return '';
    }
    if (command === 'gh' && args[0] === 'repo')
      return JSON.stringify({ isPrivate: false });
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  });

  await assert.rejects(run, /Git returned an invalid commit\/tree SHA/);
  assert.equal(
    calls.filter(
      ({ command, args }) => command === 'gh' && args[0] === 'workflow',
    ).length,
    0,
    'a bad tree SHA must not dispatch native-ci',
  );
  assert.ok(
    !calls.some(({ args }) => args[0] === 'push'),
    'a bad tree SHA must not push a validation ref',
  );
});
