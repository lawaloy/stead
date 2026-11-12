import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { runCommand } from './process-utils.mjs';
import { ROOT } from './toolchain.mjs';

const occupyPort = () =>
  new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('occupied');
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Expected an IPv4 listen address.'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });

test('the isolated journey refuses a port already serving another application', async () => {
  const { server, port } = await occupyPort();
  assert.ok(port >= 1024 && port <= 65535);
  try {
    await assert.rejects(
      runCommand(
        process.execPath,
        [join(ROOT, 'scripts/local-workflow.mjs'), 'test:journey'],
        {
          cwd: ROOT,
          quiet: true,
          env: { ...process.env, STEAD_TEST_API_PORT: String(port) },
          signal: AbortSignal.timeout(15_000),
        },
      ),
      new RegExp(
        `Port ${port} is already serving an application\\. Stop it or select another STEAD_TEST_API_PORT`,
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
