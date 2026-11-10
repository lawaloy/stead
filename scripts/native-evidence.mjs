import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const nativeEvidenceFiles = (directory, accepts) => {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return nativeEvidenceFiles(path, accepts);
    return entry.isFile() && accepts(entry.name) ? [path] : [];
  });
};

const isXCTestLog = (name) =>
  name === 'device-xctest.log' || /^xctest_runner_.*\.log$/.test(name);

export const xctestLogFiles = (directory) =>
  nativeEvidenceFiles(directory, isXCTestLog);

// Read only the tail: simulator logs can be hundreds of MB. Maestro 2.11
// streams xctest_runner_*.log into --debug-output before harvesting the
// per-flow device-xctest.log during cleanup.
const tail = (path) => {
  const file = openSync(path, 'r');
  try {
    const size = fstatSync(file).size;
    const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
    const bytes = readSync(
      file,
      buffer,
      0,
      buffer.length,
      size - buffer.length,
    );
    return buffer.toString('utf8', 0, bytes);
  } finally {
    closeSync(file);
  }
};

export const findXCTestFailure = (directory, previous = new Set()) => {
  for (const path of xctestLogFiles(directory)) {
    if (previous.has(path)) continue;
    const log = tail(path);
    if (!/Test Case '[^\r\n]*testHttpServer[^\r\n]*' failed/.test(log))
      continue;
    return {
      kind: /Failed to get screenshot: Timed out while requesting screenshot/.test(
        log,
      )
        ? 'xctest-screenshot-timeout'
        : 'xctest-server-failed',
      log: path,
    };
  }
};

// Deliberately omit entered text, environment variables, OTPs and error
// payloads. The original artifacts remain the source for detailed diagnosis.
const commandSummary = ({ command = {}, metadata = {} }) => {
  const evaluated = metadata.evaluatedCommand ?? command;
  const type = Object.keys(evaluated)[0] ?? 'unknown';
  const value = evaluated[type];
  return {
    type,
    sequence: metadata.sequenceNumber,
    status: metadata.status,
    durationMs: metadata.duration,
    fieldId:
      value?.selector?.idRegex ??
      value?.condition?.visible?.idRegex ??
      value?.condition?.notVisible?.idRegex ??
      value?.elementSelector?.idRegex,
  };
};

export const summarizeMaestro = (directory) => {
  const files = nativeEvidenceFiles(
    directory,
    (name) => name === 'commands.json',
  );
  return files.map((path) => {
    const commands = JSON.parse(readFileSync(path, 'utf8')).map(commandSummary);
    return {
      file: path,
      flow: basename(dirname(path)),
      commandCount: commands.length,
      failedCommands: commands.filter((command) => command.status === 'FAILED'),
      lastCommand: commands.at(-1),
      slowestCommands: commands
        .filter((command) => Number.isFinite(command.durationMs))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 5),
    };
  });
};
