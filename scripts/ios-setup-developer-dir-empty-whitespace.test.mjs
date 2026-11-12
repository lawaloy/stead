import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const DEFAULT_DEVELOPER_DIR = `/Applications/Xcode_${TOOLCHAIN.XCODE_VERSION}.app/Contents/Developer`;
const WHITESPACE_DEVELOPER_DIR = ' \t\n ';

const iosSetup = (developerDir, exists, commands) =>
  prepareIos({
    host: 'darwin',
    exists,
    env: {
      DEVELOPER_DIR: developerDir,
    },
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'xcodebuild')
        return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
      if (args.includes('runtimes'))
        return JSON.stringify({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return JSON.stringify({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: [
              {
                isAvailable: true,
                name: 'Stead Native iPhone 17',
                udid: 'existing-udid',
              },
            ],
          },
        });
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

test('iOS setup defaults an empty DEVELOPER_DIR and refuses a whitespace-only path before xcodebuild', async () => {
  const commands = [];
  const existsCalls = [];
  const exists = (path) => {
    existsCalls.push(path);
    return path === DEFAULT_DEVELOPER_DIR;
  };

  const selected = await iosSetup('', exists, commands);

  assert.equal(selected.DEVELOPER_DIR, DEFAULT_DEVELOPER_DIR);
  assert.deepEqual(existsCalls, [DEFAULT_DEVELOPER_DIR]);
  assert.equal(commands[0]?.[0], 'xcodebuild');

  commands.length = 0;
  existsCalls.length = 0;

  await assert.rejects(
    iosSetup(WHITESPACE_DEVELOPER_DIR, exists, commands),
    new RegExp(
      `Install Xcode ${TOOLCHAIN.XCODE_VERSION.replaceAll('.', '\\.')} \\(${TOOLCHAIN.XCODE_BUILD}\\), or set DEVELOPER_DIR`,
    ),
  );
  assert.deepEqual(existsCalls, [WHITESPACE_DEVELOPER_DIR]);
  assert.deepEqual(commands, []);
});
