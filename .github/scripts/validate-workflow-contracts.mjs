import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readQuotedItems = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    `Missing workflow contract marker: ${startMarker}`,
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing workflow contract marker: ${endMarker}`);

  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map(
    ([, value]) => value,
  );
};

const [entrypoint, reusable, nativeWorkflow] = await Promise.all([
  readFile('.github/workflows/dependency-auto-finish.yml', 'utf8'),
  readFile('.github/workflows/pr-auto-finish-reusable.yml', 'utf8'),
  readFile('.github/workflows/native-ci.yml', 'utf8'),
]);

const triggerWorkflows = readQuotedItems(entrypoint, 'workflows:', 'types:');
const requiredWorkflows = readQuotedItems(
  reusable,
  'const requiredWorkflowNames = [',
  '];',
);

assert.deepEqual(
  requiredWorkflows,
  triggerWorkflows,
  'Dependency auto-finish trigger workflows must exactly match its required workflows.',
);
assert.match(
  nativeWorkflow,
  /filters: \.github\/native-ci-paths\.yml/,
  'native-ci must use the shared native path policy.',
);

console.log('Workflow contracts are synchronized.');
