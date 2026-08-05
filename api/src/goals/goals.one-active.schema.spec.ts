import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const apiRoot = join(__dirname, '../..');

describe('Goal one-active-per-user invariant', () => {
  it('declares a partial unique index in the Prisma schema', () => {
    const schema = readFileSync(join(apiRoot, 'prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('model Goal {');
    expect(schema).toContain(
      '@@unique([userId], map: "Goal_one_active_per_user_idx", where: { isActive: true })',
    );
  });

  it('ships a migration that dedupes active goals then creates the partial unique index', () => {
    const migration = readFileSync(
      join(
        apiRoot,
        'prisma/migrations/20260802000100_one_active_goal/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('WHERE "isActive" = true');
    expect(migration).toContain('SET "isActive" = false');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Goal_one_active_per_user_idx"',
    );
    expect(migration).toContain('ON "Goal" ("userId")');
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "Goal_one_active_per_user_idx"[\s\S]*WHERE "isActive" = true;/,
    );
  });
});
