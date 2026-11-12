import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { prepareIosSimulator } from './native-workflow.mjs';

test('iOS preparation without an app id boots and installs but never launches or recovers', async () => {
  let state = 'Shutdown';
  const counts = { boot: 0, install: 0, launch: 0, erase: 0, terminate: 0 };
  const execute = async (_command, args) => {
    if (args[1] === 'list')
      return JSON.stringify({
        devices: {
          [TOOLCHAIN.IOS_RUNTIME]: [
            {
              name: 'Stead Native iPhone 17',
              udid: 'test',
              isAvailable: true,
              state,
            },
          ],
        },
      });
    if (args[1] === 'boot') {
      state = 'Booted';
      counts.boot += 1;
    }
    if (args[1] === 'install') counts.install += 1;
    if (args[1] === 'launch') {
      counts.launch += 1;
      throw new Error('launch must not run without an app id');
    }
    if (args[1] === 'erase') {
      counts.erase += 1;
      throw new Error('erase must not run without an app id');
    }
    if (args[1] === 'terminate') {
      counts.terminate += 1;
      throw new Error('terminate must not run without an app id');
    }
    return '';
  };

  assert.deepEqual(await prepareIosSimulator('test', 'mobile.app', execute), {
    recovered: false,
  });
  assert.deepEqual(counts, {
    boot: 1,
    install: 1,
    launch: 0,
    erase: 0,
    terminate: 0,
  });
});
