import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { prepareIosSimulator } from './native-workflow.mjs';

const WHITESPACE_APP_ID = ' \t\n ';

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

test('an empty iOS app id skips the pre-Maestro erase while whitespace still resets and launches', async () => {
  let state = 'Shutdown';
  const emptyCommands = [];
  const emptyExecute = async (_command, args) => {
    emptyCommands.push(args.slice(1));
    if (args[1] === 'list') return listing(state);
    if (args[1] === 'boot') state = 'Booted';
    return '';
  };

  assert.deepEqual(
    await prepareIosSimulator('test', 'mobile.app', emptyExecute, ''),
    { recovered: false },
  );
  assert.deepEqual(emptyCommands, [
    ['list', 'devices', 'available', '--json'],
    ['boot', 'test'],
    ['bootstatus', 'test', '-b'],
    ['install', 'test', 'mobile.app'],
  ]);

  state = 'Shutdown';
  const whitespaceCommands = [];
  const whitespaceExecute = async (_command, args) => {
    whitespaceCommands.push(args.slice(1));
    if (args[1] === 'list') return listing(state);
    if (args[1] === 'boot') state = 'Booted';
    return '';
  };

  assert.deepEqual(
    await prepareIosSimulator(
      'test',
      'mobile.app',
      whitespaceExecute,
      WHITESPACE_APP_ID,
    ),
    { recovered: false },
  );
  assert.deepEqual(whitespaceCommands, [
    ['list', 'devices', 'available', '--json'],
    ['erase', 'test'],
    ['boot', 'test'],
    ['bootstatus', 'test', '-b'],
    ['install', 'test', 'mobile.app'],
    ['launch', '--terminate-running-process', 'test', WHITESPACE_APP_ID],
    ['terminate', 'test', WHITESPACE_APP_ID],
  ]);
});
