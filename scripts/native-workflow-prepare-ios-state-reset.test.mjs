import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { prepareIosSimulator } from './native-workflow.mjs';

const listing = (state) =>
  JSON.stringify({
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

test('iOS state is erased before boot, install, and XCTest startup', async () => {
  const commands = [];
  const execute = async (_command, args) => {
    commands.push(args);
    if (args[1] === 'list') return listing('Shutdown');
    return '';
  };

  assert.deepEqual(
    await prepareIosSimulator('test', 'mobile.app', execute, 'com.test.app'),
    { recovered: false },
  );
  assert.deepEqual(
    commands.map((args) => args.slice(1)),
    [
      ['list', 'devices', 'available', '--json'],
      ['erase', 'test'],
      ['boot', 'test'],
      ['bootstatus', 'test', '-b'],
      ['install', 'test', 'mobile.app'],
      ['launch', '--terminate-running-process', 'test', 'com.test.app'],
      ['terminate', 'test', 'com.test.app'],
    ],
  );
});

test('a booted iOS simulator is shut down before its pre-Maestro erase', async () => {
  const commands = [];
  const execute = async (_command, args) => {
    commands.push(args);
    if (args[1] === 'list') return listing('Booted');
    return '';
  };

  await prepareIosSimulator('test', 'mobile.app', execute, 'com.test.app');
  const operations = commands.map((args) => args[1]);
  assert.ok(operations.indexOf('shutdown') < operations.indexOf('erase'));
  assert.ok(operations.indexOf('erase') < operations.indexOf('boot'));
});

test('a failed pre-Maestro erase stops before installation', async () => {
  const operations = [];
  const execute = async (_command, args) => {
    operations.push(args[1]);
    if (args[1] === 'list') return listing('Shutdown');
    if (args[1] === 'erase') throw new Error('simulator erase failed');
    return '';
  };

  await assert.rejects(
    prepareIosSimulator('test', 'mobile.app', execute, 'com.test.app'),
    /simulator erase failed/,
  );
  assert.equal(operations.includes('install'), false);
  assert.equal(operations.includes('launch'), false);
});
