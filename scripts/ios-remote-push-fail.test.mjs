import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteIos } from './ios-remote.mjs';

const feature = 'a'.repeat(40);
const tree = 'c'.repeat(40);
const branch = 'validation/ios-test';

test('a rejected git push never dispatches iOS and records failed evidence', async () => {
  const calls = [];
  const saved = new Map();
  const execute = async (command, args) => {
    calls.push({ command, args });
    if (command === 'git') {
      if (args[0] === 'status') return '';
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
      if (args[0] === 'rev-parse') {
        if (args[1]?.endsWith('^{tree}')) return tree;
        return feature;
      }
      if (args[0] === 'push') throw new Error('force-with-lease rejected');
      throw new Error(`unexpected git ${args[0]}`);
    }
    if (command === 'gh') {
      if (args[0] === 'repo') return JSON.stringify({ isPrivate: false });
      throw new Error(`unexpected gh ${args.join(' ')}`);
    }
    throw new Error(`unexpected ${command}`);
  };

  await assert.rejects(
    remoteIos({
      root: '/unused',
      iosEnabled: true,
      execute,
      token: 'test',
      log: () => {},
      sleep: async () => {},
      now: () => 0,
      save: (_directory, name, value) => saved.set(name, value),
    }),
    /force-with-lease rejected/,
  );

  const evidence = JSON.parse(saved.get('result.json'));
  assert.equal(evidence.status, 'failed');
  assert.equal(evidence.error, 'force-with-lease rejected');
  assert.ok(
    !calls.some(
      ({ command, args }) => command === 'gh' && args[0] === 'workflow',
    ),
    'a rejected upload must not dispatch native-ci',
  );
  assert.ok(
    !calls.some(({ args }) => args.includes(`:refs/heads/${branch}`)),
    'the temporary ref must not be deleted after a failed upload',
  );
});
