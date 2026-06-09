import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const apiRoot = join(__dirname, '..');

type LockfilePackage = {
  dependencies?: Record<string, string>;
  optional?: boolean;
  version?: string;
};

type PackageLock = {
  packages: Record<string, LockfilePackage>;
};

const readJson = <T = Record<string, unknown>>(fileName: string) =>
  JSON.parse(readFileSync(join(apiRoot, fileName), 'utf8')) as T;

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

describe('dependency lockfile', () => {
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

  it('retains optional @emnapi packages required by the resolver wasm binding', () => {
    const packageLock = readJson<PackageLock>('package-lock.json');
    const packages = packageLock.packages;
    const resolverPath = 'node_modules/@unrs/resolver-binding-wasm32-wasi';

    expect(packages[resolverPath]).toMatchObject({
      optional: true,
      dependencies: {
        '@emnapi/core': '1.10.0',
        '@emnapi/runtime': '1.10.0',
      },
    });

    const resolveDependency = (dependencyName: string) => {
      const candidate = lockfileDependencyCandidates(
        resolverPath,
        dependencyName,
      ).find((path) => packages[path]);
      expect(candidate).toBeDefined();
      return packages[candidate!];
    };

    expect(resolveDependency('@emnapi/core')).toMatchObject({
      optional: true,
      version: '1.10.0',
      dependencies: {
        '@emnapi/wasi-threads': expect.stringMatching(/^1\.2\.\d+$/),
      },
    });

    expect(resolveDependency('@emnapi/runtime')).toMatchObject({
      optional: true,
      version: '1.10.0',
    });
  });
});
