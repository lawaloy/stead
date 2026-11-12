import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSdkProperties } from './native-toolchain.mjs';

test('SDK source.properties parsing keeps values after the first equals sign and ignores other lines', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-sdk-properties-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'source.properties');
  writeFileSync(
    path,
    [
      '# Android SDK',
      '',
      'Pkg.Revision = 34.0.0',
      'Pkg.LicenseRef=license=android-sdk-license',
      '  Pkg.Desc = Android SDK Platform 34  ',
    ].join('\r\n'),
  );

  assert.deepEqual(readSdkProperties(path), {
    'Pkg.Revision': '34.0.0',
    'Pkg.LicenseRef': 'license=android-sdk-license',
    'Pkg.Desc': 'Android SDK Platform 34',
  });
});
