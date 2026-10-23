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

// Simulator binaries execute under macOS: their iOS keychain entitlements
// belong in __TEXT, not in the host code-signature entitlement dictionary.
export const assertSimulatorSigning = (binary) => {
  const range = (bytes, offset, size) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(size) ||
      offset < 0 ||
      size < 0 ||
      offset + size > bytes.length
    )
      throw new Error('Malformed simulator executable or code signature.');
    return bytes.subarray(offset, offset + size);
  };
  const slices = [];
  const magic = range(binary, 0, 4).readUInt32BE();
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = range(binary, 4, 4).readUInt32BE();
    const size = magic === 0xcafebabe ? 20 : 32;
    if (!count) throw new Error('Simulator executable has no architectures.');
    range(binary, 8, count * size);
    for (let index = 0; index < count; index++) {
      const entry = range(binary, 8 + index * size, size);
      const offset =
        size === 20 ? entry.readUInt32BE(8) : Number(entry.readBigUInt64BE(8));
      const length =
        size === 20
          ? entry.readUInt32BE(12)
          : Number(entry.readBigUInt64BE(16));
      slices.push(range(binary, offset, length));
    }
  } else slices.push(binary);
  for (const slice of slices) {
    const header = range(slice, 0, 32);
    if (header.readUInt32LE() !== 0xfeedfacf)
      throw new Error('Expected a 64-bit simulator Mach-O executable.');
    const count = header.readUInt32LE(16);
    const commands = range(slice, 32, header.readUInt32LE(20));
    let offset = 0,
      platform,
      signature;
    for (let index = 0; index < count; index++) {
      const command = range(commands, offset, 8);
      const type = command.readUInt32LE();
      const size = command.readUInt32LE(4);
      if (size < 8) throw new Error('Malformed simulator load command.');
      const value = range(commands, offset, size);
      if (type === 0x32) platform = range(value, 8, 4).readUInt32LE();
      if (type === 0x1d)
        signature = range(
          slice,
          range(value, 8, 4).readUInt32LE(),
          range(value, 12, 4).readUInt32LE(),
        );
      offset += size;
    }
    if (platform !== 7 || !signature)
      throw new Error('Expected a signed iOS Simulator executable.');
    const superblob = range(signature, 0, 12);
    if (superblob.readUInt32BE() !== 0xfade0cc0)
      throw new Error('Malformed simulator code signature.');
    const signed = range(signature, 0, superblob.readUInt32BE(4));
    const slots = superblob.readUInt32BE(8);
    range(signed, 12, slots * 8);
    for (let index = 0; index < slots; index++) {
      const slot = signed.readUInt32BE(12 + index * 8);
      if (![5, 7].includes(slot)) continue;
      const start = signed.readUInt32BE(16 + index * 8);
      const blob = range(signed, start, 8);
      const content = range(signed, start + 8, blob.readUInt32BE(4) - 8);
      for (const key of ['application-identifier', 'keychain-access-groups'])
        if (content.includes(Buffer.from(key)))
          throw new Error(
            `Simulator host signature contains iOS ${key}. Keep simulator entitlements embedded in Mach-O and use a plain ad-hoc signature.`,
          );
    }
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--check-signature') {
      assertSimulatorSigning(readFileSync(process.argv[3]));
      console.log('Simulator host signature has no iOS keychain entitlements.');
      process.exit(0);
    }
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
