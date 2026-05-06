import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');

const readJson = (fileName: string) =>
  JSON.parse(readFileSync(join(mobileRoot, fileName), 'utf8')) as Record<
    string,
    unknown
  >;

describe('dependency overrides', () => {
  it('pins postcss to the patched version in package metadata and lockfile', () => {
    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');

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
});
