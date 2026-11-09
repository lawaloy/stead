import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

const apiRoot = join(__dirname, '..');
const requireDependency = createRequire(join(apiRoot, 'package.json'));
const satisfies = requireDependency('semver/functions/satisfies') as (
  version: string,
  range: string,
) => boolean;

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
    packageName: 'js-yaml',
    version: '4.3.2',
    lockfilePath: 'node_modules/js-yaml',
  },
  {
    packageName: 'deepmerge-ts',
    version: '8.0.1',
    lockfilePath: 'node_modules/deepmerge-ts',
  },
  {
    packageName: 'mysql2',
    version: '3.24.3',
    lockfilePath: 'node_modules/mysql2',
  },
  {
    packageName: 'multer',
    version: '2.5.0',
    lockfilePath: 'node_modules/multer',
  },
  {
    packageName: 'proxy-addr',
    version: '2.0.8',
    lockfilePath: 'node_modules/proxy-addr',
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
  it('keeps vulnerable glob and minimatch versions out of every nested dependency path', () => {
    const packageJson = readJson<{ overrides: Record<string, string> }>(
      'package.json',
    );
    const packages = readJson<PackageLock>('package-lock.json').packages;
    for (const [name, range, patched] of [
      ['glob', '>=9 <14.0.2', '14.0.4'],
      ['minimatch', '>=7 <11.0.1', '11.0.5'],
    ]) {
      expect(packageJson.overrides[`${name}@${range}`]).toBe(patched);
      const copies = Object.entries(packages).filter(([path]) =>
        path.endsWith(`node_modules/${name}`),
      );
      expect(copies.length).toBeGreaterThan(0);
      for (const [path, metadata] of copies) {
        expect({
          path,
          vulnerable: satisfies(metadata.version!, range),
        }).toEqual({ path, vulnerable: false });
      }
    }
  });

  it('keeps sync and async instrumentation discovery compatible with the patched glob APIs', async () => {
    const TestExclude = requireDependency('test-exclude') as new (options: {
      cwd: string;
      include: string[];
      exclude: string[];
      extension: string[];
    }) => { glob(): Promise<string[]>; globSync(): string[] };
    const directory = mkdtempSync(join(tmpdir(), 'stead-glob-compatibility-'));
    try {
      mkdirSync(join(directory, 'src', 'nested'), { recursive: true });
      for (const file of ['keep.ts', 'ignore.spec.ts', 'nested/deep.ts']) {
        writeFileSync(join(directory, 'src', file), 'export {};');
      }
      const exclude = new TestExclude({
        cwd: directory,
        include: ['src/**/*.ts'],
        exclude: ['**/*.spec.ts'],
        extension: ['.ts'],
      });
      const expected = ['src/keep.ts', 'src/nested/deep.ts'];
      expect(exclude.globSync().sort()).toEqual(expected);
      expect((await exclude.glob()).sort()).toEqual(expected);
      const legacy = createRequire(
        join(apiRoot, 'node_modules/@eslint/eslintrc/package.json'),
      )('minimatch') as (path: string, pattern: string) => boolean;
      expect(legacy('src/keep.ts', '**/*.ts')).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('pins audit-remediated packages in package metadata and lockfile', () => {
    const packageJson = readJson<{
      overrides: Record<string, string | Record<string, string>>;
    }>('package.json');
    const packageLock = readJson<PackageLock>('package-lock.json');

    for (const pin of auditRemediationPins) {
      expect(packageJson.overrides[pin.packageName]).toBe(pin.version);

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
