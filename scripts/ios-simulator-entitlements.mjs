import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const extractEntitlements = (binary, commands) => {
  const section = commands.match(
    /sectname __entitlements\s+segname __TEXT\s+addr \S+\s+size (0x[0-9a-fA-F]+)\s+offset (\d+)/,
  );
  if (!section)
    throw new Error('Simulator executable has no embedded entitlements.');
  const size = Number(section[1]);
  const offset = Number(section[2]);
  if (
    !Number.isSafeInteger(size) ||
    !Number.isSafeInteger(offset) ||
    size <= 0 ||
    offset + size > binary.length
  ) {
    throw new Error('Simulator entitlement section is outside the executable.');
  }
  return binary.subarray(offset, offset + size);
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const [binaryPath, commandsPath, outputPath] = process.argv.slice(2);
    if (!binaryPath || !commandsPath || !outputPath)
      throw new Error('Expected executable, load-commands, and output paths.');
    const result = extractEntitlements(
      readFileSync(binaryPath),
      readFileSync(commandsPath, 'utf8'),
    );
    writeFileSync(outputPath, result);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
