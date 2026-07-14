import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');

type LockfilePackage = {
  dependencies?: Record<string, string>;
  peer?: boolean;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
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
  it('pins postcss to the patched version in package metadata and lockfile', () => {
    const packageJson = readJson('package.json');
    const packageLock = readJson<PackageLock>('package-lock.json');

    expect(packageJson).toMatchObject({
      overrides: {
        postcss: '8.5.10',
      },
    });

    expect(packageLock).toMatchObject({
      packages: {
        'node_modules/postcss': {
          version: '8.5.10',
        },
      },
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

  it('retains Expo optional native peer metadata without forcing peer installs', () => {
    const packageJson = readJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>('package.json');
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
        'react-native-worklets': '^0.7.4 || ^0.8.0',
      },
      peerDependenciesMeta: {
        'react-native-worklets': {
          optional: true,
        },
      },
    });

    expect(packageJson.dependencies?.['react-native-reanimated']).toBeUndefined();
    expect(packageJson.dependencies?.['react-native-worklets']).toBeUndefined();
    expect(
      packageJson.devDependencies?.['react-native-reanimated'],
    ).toBeUndefined();
    expect(packageJson.devDependencies?.['react-native-worklets']).toBeUndefined();
  });
});
