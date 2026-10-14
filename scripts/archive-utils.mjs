import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { runCommand } from './process-utils.mjs';

export const verifyArchive = async (file, expected, size) => {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  if (hash.digest('hex') !== expected || (size !== undefined && bytes !== size))
    throw new Error(
      `Archive checksum/size mismatch: ${file}. Nothing was installed.`,
    );
};

export const downloadArchive = async (url, file) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok)
    throw new Error(`Archive download failed: HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
};

export const extractZip = async (archive, destination) => {
  if (process.platform === 'win32') {
    mkdirSync(destination, { recursive: true });
    await runCommand('tar.exe', ['-xf', archive, '-C', destination]);
  } else await runCommand('unzip', ['-q', archive, '-d', destination]);
};

// Windows scanners can briefly retain handles after tar exits. Retry only
// those filesystem locks; checksum, permission and SDK failures still fail.
export const moveExtractedPackage = async (
  source,
  destination,
  move = rename,
  pause = delay,
) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await move(source, destination);
    } catch (error) {
      if (!['EPERM', 'EBUSY'].includes(error.code) || attempt >= 10)
        throw error;
      await pause(Math.min(200 * (attempt + 1), 1000));
    }
  }
};
