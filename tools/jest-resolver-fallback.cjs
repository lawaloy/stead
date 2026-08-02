const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const projectRequire = Module.createRequire(
  path.join(process.cwd(), 'package.json'),
);

try {
  projectRequire('unrs-resolver');
} catch {
  const resolveFileOrDirectory = (candidate, extensions = []) => {
    const suffixes = ['', ...extensions];

    for (const suffix of suffixes) {
      const file = `${candidate}${suffix}`;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }

    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      return null;
    }

    const packageJsonPath = path.join(candidate, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.main === 'string') {
        const main = resolveFileOrDirectory(
          path.resolve(candidate, packageJson.main),
          extensions,
        );
        if (main) return main;
      }
    }

    for (const suffix of suffixes) {
      const index = path.join(candidate, `index${suffix}`);
      if (fs.existsSync(index) && fs.statSync(index).isFile()) return index;
    }

    return null;
  };

  class ResolverFactory {
    constructor(options = {}) {
      this.options = options;
    }

    cloneWithOptions(options = {}) {
      return new ResolverFactory({ ...this.options, ...options });
    }

    clearCache() {}

    sync(basedir, request) {
      try {
        return {
          path: Module.createRequire(
            path.join(basedir, '__jest_resolver__.js'),
          ).resolve(request),
        };
      } catch {
        if (request.startsWith('.') || path.isAbsolute(request)) {
          const candidate = path.isAbsolute(request)
            ? request
            : path.resolve(basedir, request);
          const resolved = resolveFileOrDirectory(
            candidate,
            this.options.extensions,
          );
          if (resolved) return { path: resolved };
        }

        return { error: `Cannot find module '${request}'` };
      }
    }

    async(basedir, request) {
      return Promise.resolve(this.sync(basedir, request));
    }
  }

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'unrs-resolver') {
      return { ResolverFactory };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}
