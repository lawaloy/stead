import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertContainerOwnedRun,
  assertContainerSourceIdentity,
} from './android-container-entry.mjs';
import { parseNativeArguments } from './native-config.mjs';

const validSource = () => ({
  commit: 'a'.repeat(40),
  workingTreeClean: true,
  providedApp: false,
});

test('container source identity accepts a 40-character lowercase SHA and boolean flags', () => {
  const source = validSource();
  assert.equal(assertContainerSourceIdentity(source), source);
  assert.deepEqual(
    assertContainerSourceIdentity({
      commit: 'cafebabe'.repeat(5),
      workingTreeClean: false,
      providedApp: true,
    }),
    {
      commit: 'cafebabe'.repeat(5),
      workingTreeClean: false,
      providedApp: true,
    },
  );
});

test('container source identity rejects missing, uppercase, short, and non-boolean fields', () => {
  for (const source of [
    undefined,
    null,
    {},
    { ...validSource(), commit: 'A'.repeat(40) },
    { ...validSource(), commit: 'a'.repeat(39) },
    { ...validSource(), commit: ` ${'a'.repeat(40)}` },
    { ...validSource(), commit: `${'a'.repeat(40)}\n` },
    { ...validSource(), workingTreeClean: 'true' },
    { ...validSource(), providedApp: 0 },
    { commit: 'a'.repeat(40), workingTreeClean: true },
    { commit: 'a'.repeat(40), providedApp: false },
  ])
    assert.throws(
      () => assertContainerSourceIdentity(source),
      /Container source identity is missing or invalid/,
    );
});

test('container entry owns the emulator and image APK and refuses host device, app, or repeats', () => {
  const owned = parseNativeArguments(['test', '--platform', 'android']);
  assert.equal(assertContainerOwnedRun(owned), owned);
  assert.equal(owned.repeat, 1);
  assert.equal(owned.device, undefined);
  assert.equal(owned.app, undefined);

  assert.throws(
    () =>
      assertContainerOwnedRun(
        parseNativeArguments(['test', '--device', 'emulator-5554']),
      ),
    /owns one fresh emulator and its image-built APK/,
  );
  assert.throws(
    () =>
      assertContainerOwnedRun(
        parseNativeArguments(['test', '--app', 'mobile/.ci/android/other.apk']),
      ),
    /owns one fresh emulator and its image-built APK/,
  );
  assert.throws(
    () =>
      assertContainerOwnedRun(parseNativeArguments(['test', '--repeat', '2'])),
    /owns one fresh emulator and its image-built APK/,
  );
});
