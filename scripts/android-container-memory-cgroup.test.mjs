import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  containerMemorySnapshot,
  saveContainerMemory,
} from './android-container-entry.mjs';

test('container evidence keeps an unlimited cgroup limit as max instead of NaN', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead memory max '));
  try {
    writeFileSync(join(directory, 'memory.current'), '1073741824\n');
    writeFileSync(join(directory, 'memory.peak'), '2147483648\n');
    writeFileSync(join(directory, 'memory.max'), 'max\n');
    writeFileSync(join(directory, 'memory.events'), 'oom_kill 0\n');

    assert.deepEqual(containerMemorySnapshot(directory), {
      currentBytes: 1073741824,
      peakBytes: 2147483648,
      limitBytes: 'max',
      events: { oom_kill: 0 },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('container evidence fails closed when a cgroup counter is unreadable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead memory eisdir '));
  try {
    mkdirSync(join(directory, 'memory.max'));
    assert.throws(() => containerMemorySnapshot(directory), { code: 'EISDIR' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('container cleanup records a healthy memory snapshot without treating zero OOM kills as failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead memory save '));
  try {
    writeFileSync(join(directory, 'memory.current'), '1024');
    writeFileSync(join(directory, 'memory.peak'), '2048');
    writeFileSync(join(directory, 'memory.max'), '4096');
    writeFileSync(join(directory, 'memory.events'), 'low 0\noom_kill 0\n');
    const output = join(directory, 'saved.json');

    assert.doesNotThrow(() => saveContainerMemory(output, directory));
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
      currentBytes: 1024,
      peakBytes: 2048,
      limitBytes: 4096,
      events: { low: 0, oom_kill: 0 },
    });

    rmSync(join(directory, 'memory.events'));
    const missingEvents = join(directory, 'missing-events.json');
    assert.doesNotThrow(() => saveContainerMemory(missingEvents, directory));
    assert.equal(JSON.parse(readFileSync(missingEvents, 'utf8')).events, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
