import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { prepareIosSimulator } from './native-workflow.mjs';

const crlfJson = (value) => `${JSON.stringify(value)}\r\n`;

test('iOS journey prep accepts CRLF simctl JSON when the dedicated simulator is present', async () => {
  let state = 'Shutdown';
  const counts = { boot: 0, install: 0, launch: 0, erase: 0 };
  const execute = async (_command, args) => {
    if (args[1] === 'list')
      return crlfJson({
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
  });
});

test('iOS journey prep still refuses a personal simulator in CRLF simctl JSON', async () => {
  const execute = async (_command, args) => {
    if (args[1] === 'list')
      return crlfJson({
        devices: {
          [TOOLCHAIN.IOS_RUNTIME]: [
            {
              name: 'iPhone 17',
              udid: 'personal',
              isAvailable: true,
              state: 'Booted',
            },
          ],
        },
      });
    throw new Error(`Unexpected ${args.join(' ')}`);
  };

  await assert.rejects(
    prepareIosSimulator('personal', 'mobile.app', execute),
    /Create a dedicated simulator named "Stead Native iPhone 17"/,
  );
});
