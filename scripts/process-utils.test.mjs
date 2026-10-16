import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveCommand,
  runCommand,
  spawnOwned,
  stopOwned,
  assertPortAvailable,
  withCleanup,
} from './process-utils.mjs';

test('all cleanup actions run and preserve the original failure plus cleanup failures', async () => {
  const cleaned = [];
  await assert.rejects(
    withCleanup(async () => {
      throw new Error('original failure');
    }, [
      () => {
        cleaned.push('first');
        throw new Error('cleanup failure');
      },
      async () => {
        cleaned.push('second');
      },
    ]),
    (error) => {
      assert.equal(error.errors.length, 2);
      assert.match(error.message, /original failure.*cleanup failure/);
      return true;
    },
  );
  assert.deepEqual(cleaned, ['first', 'second']);
});

test('machine-readable stdout is not corrupted by stderr warnings or truncated', async () => {
  const output = await runCommand(
    process.execPath,
    [
      '-e',
      'console.error("warning");console.log(JSON.stringify({value:"x".repeat(250000)}))',
    ],
    { quiet: true, stdoutOnly: true },
  );
  assert.equal(JSON.parse(output).value.length, 250000);
});

test('npm resolution uses its exact CLI path without a shell', () => {
  const command = resolveCommand(
    'npm',
    ['--version'],
    { npm_execpath: '/npm cli.js' },
    'win32',
  );
  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args, ['/npm cli.js', '--version']);
});

test(
  'nested npm commands use the same pinned CLI as their parent',
  { skip: !process.env.npm_execpath },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'stead npm '));
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ scripts: { probe: 'npm --version' } }),
    );
    try {
      const expected = (
        await runCommand('npm', ['--version'], { quiet: true })
      ).trim();
      const actual = (
        await runCommand('npm', ['run', 'probe', '--silent'], {
          cwd: directory,
          quiet: true,
        })
      ).trim();
      assert.equal(actual, expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('Windows batch quoting prevents environment expansion and preserves spaces', () => {
  const command = resolveCommand(
    'C:\\tool path\\tool.bat',
    ['a & b', '$literal'],
    {},
    'win32',
  );
  assert.equal(command.command, 'C:\\tool path\\tool.bat');
  assert.deepEqual(command.args, ['a & b', '$literal']);
  for (const argument of [
    '%PATH%',
    '!EXPAND!',
    '" & evil',
    'caret^escape',
    'line\nbreak',
  ])
    assert.throws(() => resolveCommand('tool.bat', [argument], {}, 'win32'));
});

test('a busy test port is rejected without stopping its owner', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(assertPortAvailable(server.address().port), /busy/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('command failures preserve diagnostic output and return failure', async () => {
  await assert.rejects(
    runCommand(
      process.execPath,
      ['-e', 'console.error("failure evidence");process.exit(7)'],
      { quiet: true },
    ),
    /failure evidence/,
  );
});

test('caller options cannot enable shell parsing of command arguments', async () => {
  const argument = 'literal & echo should-not-execute';
  const output = await runCommand(
    process.execPath,
    ['-e', 'console.log(process.argv[1])', argument],
    { quiet: true, shell: true },
  );
  assert.equal(output.trim(), argument);
});

test(
  'stopping an owned process stops its child even after the parent exits',
  { timeout: 15_000 },
  async () => {
    const grandchild =
      'process.on("SIGTERM",()=>{});const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>console.log(s.address().port));';
    const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});setInterval(()=>{},1000);`;
    const child = spawnOwned(process.execPath, ['-e', parent], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const port = await new Promise((resolve, reject) => {
        child.stdout.once('data', (chunk) =>
          resolve(Number(String(chunk).trim())),
        );
        child.completion.catch(reject);
      });
      await assert.rejects(assertPortAvailable(port), /busy/);
      await stopOwned(child);
      await assertPortAvailable(port);
    } finally {
      await stopOwned(child);
    }
  },
);

test(
  'Windows batch tools actually execute and return their exit code',
  { skip: process.platform !== 'win32' },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'stead batch '));
    const path = join(directory, 'probe.cmd');
    writeFileSync(path, '@echo off\r\necho ARG=%1\r\nexit /b 9\r\n');
    try {
      await assert.rejects(
        runCommand(path, ['a & b'], { quiet: true }),
        /ARG="a & b"/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'cancellation stops an owned child service tree',
  { timeout: 15_000 },
  async () => {
    const controller = new AbortController();
    const service =
      'require("node:net").createServer().listen(0,"127.0.0.1",function(){console.log(this.address().port)});';
    const child = spawnOwned(
      process.execPath,
      [
        '-e',
        `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(service)}],{stdio:'inherit'});setInterval(()=>{},1000);`,
      ],
      { signal: controller.signal, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    try {
      const port = await new Promise((resolve, reject) => {
        child.stdout.once('data', (chunk) =>
          resolve(Number(String(chunk).trim())),
        );
        child.completion.catch(reject);
      });
      controller.abort();
      await child.stopping;
      await assertPortAvailable(port);
    } finally {
      await stopOwned(child);
    }
  },
);
