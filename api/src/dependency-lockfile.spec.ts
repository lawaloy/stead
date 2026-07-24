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

const auditRemediationPins = [
  {
    packageName: '@angular-devkit/core',
    version: '21.2.14',
    lockfilePath: 'node_modules/@angular-devkit/core',
  },
  {
    packageName: '@angular-devkit/schematics',
    version: '21.2.14',
    lockfilePath: 'node_modules/@angular-devkit/schematics',
  },
  {
    packageName: '@angular-devkit/schematics-cli',
    version: '21.2.14',
    lockfilePath: 'node_modules/@angular-devkit/schematics-cli',
  },
  {
    packageName: 'file-type',
    version: '21.3.2',
    lockfilePath: 'node_modules/file-type',
  },
  {
    packageName: 'js-yaml',
    version: '4.3.0',
    lockfilePath: 'node_modules/js-yaml',
  },
  {
    packageName: 'lodash',
    version: '4.18.1',
    lockfilePath: 'node_modules/lodash',
  },
  {
    packageName: 'multer',
    version: '2.2.0',
    lockfilePath: 'node_modules/multer',
  },
  {
    packageName: 'handlebars',
    version: '4.7.9',
    lockfilePath: 'node_modules/handlebars',
  },
  {
    packageName: '@hono/node-server',
    version: '2.0.11',
    lockfilePath: 'node_modules/@hono/node-server',
  },
  {
    packageName: 'valibot',
    version: '1.4.2',
    lockfilePath: 'node_modules/valibot',
  },
] as const;

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
  it('pins audit-remediated packages in package metadata and lockfile', () => {
    const packageJson = readJson<{
      overrides: Record<string, string | Record<string, string>>;
    }>('package.json');
    const packageLock = readJson<PackageLock>('package-lock.json');

    for (const pin of auditRemediationPins) {
      if (pin.packageName === 'handlebars') {
        expect(packageJson.overrides['ts-jest']).toMatchObject({
          handlebars: pin.version,
        });
      } else {
        expect(packageJson.overrides[pin.packageName]).toBe(pin.version);
      }

      expect(packageLock.packages[pin.lockfilePath]).toMatchObject({
        version: pin.version,
      });
    }
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

    const emnapiCore = resolveDependency('@emnapi/core');

    expect(emnapiCore).toMatchObject({
      optional: true,
      version: '1.10.0',
    });
    expect(emnapiCore.dependencies?.['@emnapi/wasi-threads']).toMatch(
      /^1\.2\.\d+$/,
    );

    expect(resolveDependency('@emnapi/runtime')).toMatchObject({
      optional: true,
      version: '1.10.0',
    });
  });
});
