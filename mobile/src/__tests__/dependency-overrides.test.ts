import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');

type LockfilePackage = {
  dependencies?: Record<string, string>;
  link?: boolean;
  name?: string;
  peer?: boolean;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  resolved?: string;
  version?: string;
};

type PackageLock = {
  packages: Record<string, LockfilePackage>;
};

const readJson = <T = Record<string, unknown>>(fileName: string) =>
  JSON.parse(readFileSync(join(mobileRoot, fileName), 'utf8')) as T;

const findLockfilePackage = (
  packages: Record<string, LockfilePackage>,
  packageName: string,
): LockfilePackage | undefined => {
  const directPath = `node_modules/${packageName}`;
  if (packages[directPath]) {
    return packages[directPath];
  }

  const nestedPath = Object.keys(packages).find((path) =>
    path.endsWith(`/node_modules/${packageName}`),
  );

  return nestedPath ? packages[nestedPath] : undefined;
};

const lockfileDependencyCandidates = (
  packagePath: string,
  dependencyName: string,
) => {
  const rootDependencyPath = `node_modules/${dependencyName}`;

  if (packagePath === '') {
    return [rootDependencyPath];
  }

  const candidates: string[] = [];
  let currentPath = packagePath;

  while (true) {
    candidates.push(posix.join(currentPath, 'node_modules', dependencyName));

    const ancestorIndex = currentPath.lastIndexOf('/node_modules/');
    if (ancestorIndex === -1) {
      break;
    }

    currentPath = currentPath.slice(0, ancestorIndex);
  }

  candidates.push(rootDependencyPath);

  return Array.from(new Set(candidates));
};

describe('dependency overrides', () => {
  it('pins URL decoding to the patched version in package metadata and lockfile', () => {
    const packageJson = readJson('package.json');
    const packageLock = readJson<PackageLock>('package-lock.json');

    expect(packageJson).toMatchObject({
      overrides: {
        'decode-uri-component': '0.5.0',
      },
    });
    expect(
      packageLock.packages['node_modules/decode-uri-component'],
    ).toMatchObject({
      version: '0.5.0',
    });
  });

  it('keeps every package dependency resolvable in the lockfile', () => {
    const packageLock = readJson<PackageLock>('package-lock.json');

    const missingDependencies = Object.entries(packageLock.packages).flatMap(
      ([packagePath, metadata]) =>
        Object.keys(metadata.dependencies ?? {})
          .filter(
            (dependencyName) =>
              !lockfileDependencyCandidates(packagePath, dependencyName).some(
                (candidate) => packageLock.packages[candidate],
              ),
          )
          .map(
            (dependencyName) =>
              `${packagePath || '<root>'} -> ${dependencyName}`,
          ),
    );

    expect(missingDependencies).toEqual([]);
  });

  it('retains Expo optional native peer metadata', () => {
    const packageLock = readJson<PackageLock>('package-lock.json');
    const packages = packageLock.packages;

    expect(packages['node_modules/expo-router']).toMatchObject({
      peerDependencies: {
        'react-native-reanimated': '*',
      },
      peerDependenciesMeta: {
        'react-native-reanimated': {
          optional: true,
        },
      },
    });

    expect(packages['node_modules/@expo/ui']).toMatchObject({
      peerDependencies: {
        'react-native-worklets': '*',
      },
      peerDependenciesMeta: {
        'react-native-worklets': {
          optional: true,
        },
      },
    });

    expect(findLockfilePackage(packages, 'expo-modules-core')).toMatchObject({
      peerDependencies: {
        'react-native-worklets': '^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0',
      },
      peerDependenciesMeta: {
        'react-native-worklets': {
          optional: true,
        },
      },
    });
  });

  it('pins Reanimated and worklets as Expo SDK-aligned direct dependencies', () => {
    // The app never imports these, but react-native-drawer-layout (via
    // expo-router) pulls Reanimated in and expo-modules-core peers on
    // worklets. Left transitive, npm was free to float them: #537 broke
    // native builds when the lockfile drifted to Reanimated 4.2.2, which
    // rejects React Native 0.86. Pinning them as direct deps with
    // `npx expo install` keeps them on the SDK's tested pair, which supports
    // RN 0.86 and satisfies expo-modules-core's worklets range.
    // deps-maintenance keeps them aligned with `expo install --fix`
    // (ncu rejects react-native-*).
    const packageJson = readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>('package.json');
    const packageLock = readJson<PackageLock>('package-lock.json');
    const bundledNativeModules = JSON.parse(
      readFileSync(
        join(mobileRoot, 'node_modules', 'expo', 'bundledNativeModules.json'),
        'utf8',
      ),
    ) as Record<string, string>;

    for (const packageName of [
      'react-native-reanimated',
      'react-native-worklets',
    ]) {
      const expoVersion = bundledNativeModules[packageName];
      const lockedPackage = packageLock.packages[`node_modules/${packageName}`];

      expect(expoVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(packageJson.dependencies?.[packageName]).toBe(expoVersion);
      expect(packageJson.devDependencies?.[packageName]).toBeUndefined();
      expect(packageLock.packages[''].dependencies?.[packageName]).toBe(
        expoVersion,
      );
      expect(lockedPackage?.version).toBe(expoVersion);
      expect(lockedPackage?.peer).toBeUndefined();
    }
  });
});
