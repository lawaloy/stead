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

test('iOS preparation terminates a successful first launch so Maestro starts cold', async () => {
  let state = 'Shutdown';
  const commands = [];
  const execute = async (_command, args) => {
    commands.push(args);
    if (args[1] === 'list') return listing(state);
    if (args[1] === 'boot') state = 'Booted';
    if (args[1] === 'terminate') throw new Error('already not running');
    return '';
  };

  assert.deepEqual(
    await prepareIosSimulator('test', 'mobile.app', execute, 'com.test.app'),
    { recovered: false },
  );
  assert.deepEqual(commands.at(-1), [
    'simctl',
    'terminate',
    'test',
    'com.test.app',
  ]);
  assert.equal(commands.filter((args) => args[1] === 'launch').length, 1);
  assert.equal(commands.filter((args) => args[1] === 'erase').length, 0);
});

test('iOS preparation still terminates after erase-and-reboot recovery', async () => {
  let state = 'Shutdown';
  let launches = 0;
  const terminates = [];
  const execute = async (_command, args) => {
    if (args[1] === 'list') return listing(state);
    if (args[1] === 'boot') state = 'Booted';
    if (args[1] === 'shutdown') state = 'Shutdown';
    if (args[1] === 'launch' && ++launches === 1)
      throw new Error('FBS refused the first launch');
    if (args[1] === 'terminate') {
      terminates.push([...args]);
      throw new Error('SpringBoard already tore down the process');
    }
    return '';
  };

  assert.deepEqual(
    await prepareIosSimulator('test', 'mobile.app', execute, 'com.test.app'),
    { recovered: true },
  );
  assert.equal(launches, 2);
  assert.deepEqual(terminates, [
    ['simctl', 'terminate', 'test', 'com.test.app'],
  ]);
});
