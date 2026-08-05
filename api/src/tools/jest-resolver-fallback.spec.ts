import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('jest-resolver-fallback', () => {
  const fallbackPath = realpathSync(
    join(__dirname, '..', '..', '..', 'tools', 'jest-resolver-fallback.cjs'),
  );

  const runProbe = (probeSource: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'jest-resolver-fallback-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'jest-resolver-probe', private: true }),
      );
      mkdirSync(join(dir, 'pkg'));
      writeFileSync(
        join(dir, 'pkg', 'package.json'),
        JSON.stringify({ name: 'pkg', main: './dist/entry.js' }),
      );
      mkdirSync(join(dir, 'pkg', 'dist'));
      writeFileSync(
        join(dir, 'pkg', 'dist', 'entry.js'),
        'module.exports = 1;\n',
      );
      writeFileSync(join(dir, 'sibling.js'), 'module.exports = 2;\n');
      writeFileSync(join(dir, 'probe.js'), probeSource);

      const result = spawnSync(process.execPath, ['probe.js'], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_PATH: '',
        },
      });

      if (result.status !== 0) {
        throw new Error(
          `probe failed (${result.status}): ${result.stderr || result.stdout}`,
        );
      }

      return JSON.parse(result.stdout) as Record<string, unknown>;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('falls back to relative, package.json main, and missing-module resolution', () => {
    const output = runProbe(`
      require(${JSON.stringify(fallbackPath)});
      const { ResolverFactory } = require('unrs-resolver');
      const resolver = new ResolverFactory({ extensions: ['.js'] });
      const relative = resolver.sync(process.cwd(), './sibling.js');
      const viaMain = resolver.sync(process.cwd(), './pkg');
      const missing = resolver.sync(process.cwd(), 'definitely-missing-module');
      const cloned = resolver.cloneWithOptions({ extensions: ['.js'] });
      const asyncResult = cloned.async(process.cwd(), './sibling.js');
      Promise.resolve(asyncResult).then((resolved) => {
        console.log(JSON.stringify({
          relative,
          viaMain,
          missing,
          asyncPath: resolved.path,
        }));
      });
    `);

    expect(output.relative).toEqual(
      expect.objectContaining({
        path: expect.stringMatching(/sibling\.js$/) as unknown,
      }),
    );
    expect(output.viaMain).toEqual(
      expect.objectContaining({
        path: expect.stringMatching(/entry\.js$/) as unknown,
      }),
    );
    expect(output.missing).toEqual({
      error: "Cannot find module 'definitely-missing-module'",
    });
    expect(output.asyncPath).toEqual(
      expect.stringMatching(/sibling\.js$/) as unknown,
    );
  });
});
