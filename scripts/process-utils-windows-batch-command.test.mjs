import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommand } from './process-utils.mjs';

test('Windows batch quoting rejects unsafe characters in the command path', () => {
  for (const command of [
    'C:\\tools\\%TEMP%\\tool.cmd',
    'C:\\tools\\!EXPAND!\\tool.bat',
    'C:\\tools\\"quoted"\\tool.cmd',
    'C:\\tools\\caret^escape\\tool.bat',
    'C:\\tools\\line\nbreak\\tool.cmd',
  ])
    assert.throws(
      () => resolveCommand(command, ['ok'], {}, 'win32'),
      /Unsafe Windows batch argument/,
    );

  const safe = resolveCommand(
    'C:\\tool path\\tool.cmd',
    ['payload'],
    {},
    'win32',
  );
  assert.equal(safe.command, 'C:\\tool path\\tool.cmd');
  assert.deepEqual(safe.args, ['payload']);
});
