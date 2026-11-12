import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommand } from './process-utils.mjs';

test('Windows batch quoting rejects unsafe characters in arguments, not only the command path', () => {
  const command = 'C:\\tools\\tool.cmd';
  for (const args of [
    ['%TEMP%'],
    ['ok', '!EXPAND!'],
    ['"quoted"'],
    ['caret^escape'],
    ['line\nbreak'],
  ])
    assert.throws(
      () => resolveCommand(command, args, {}, 'win32'),
      /Unsafe Windows batch argument/,
    );

  const safe = resolveCommand(command, ['payload with spaces'], {}, 'win32');
  assert.equal(safe.command, command);
  assert.deepEqual(safe.args, ['payload with spaces']);
});
