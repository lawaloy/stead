import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeSourceIdentity } from './native-workflow.mjs';
import { ROOT } from './toolchain.mjs';

test('native source identity reads git HEAD and dirty-tree status when options.source is omitted', async () => {
  const calls = [];
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'git' && args[0] === 'rev-parse')
      return `${'a'.repeat(40)}\n`;
    if (command === 'git' && args[0] === 'status')
      return ' M scripts/native-workflow.mjs\n';
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  };

  assert.deepEqual(await nativeSourceIdentity({}, execute), {
    commit: 'a'.repeat(40),
    workingTreeClean: false,
    build: 'source',
  });
  assert.deepEqual(
    calls.map(({ command, args, options }) => ({
      command,
      args,
      cwd: options.cwd,
    })),
    [
      { command: 'git', args: ['rev-parse', 'HEAD'], cwd: ROOT },
      { command: 'git', args: ['status', '--porcelain'], cwd: ROOT },
    ],
  );
});

test('native source identity records a provided artifact when Git reports a clean tree', async () => {
  const execute = async (command, args) => {
    if (command === 'git' && args[0] === 'rev-parse')
      return `${'b'.repeat(40)}\n`;
    if (command === 'git' && args[0] === 'status') return '\n';
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  };

  assert.deepEqual(
    await nativeSourceIdentity({ app: '/tmp/stead-debug.apk' }, execute),
    {
      commit: 'b'.repeat(40),
      workingTreeClean: true,
      build: 'provided-artifact',
    },
  );
});

test('native source identity fails closed when git HEAD cannot be resolved', async () => {
  await assert.rejects(
    nativeSourceIdentity({}, async () => {
      throw new Error('not a git repository');
    }),
    /not a git repository/,
  );
});
