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

  it('ships lifecycle state and history indexing with deterministic backfill rules', () => {
    const schema = readFileSync(join(apiRoot, 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      join(
        apiRoot,
        'prisma/migrations/20260907000100_goal_lifecycle_history/migration.sql',
      ),
      'utf8',
    );

    expect(schema).toContain('enum GoalStatus {');
    expect(schema).toMatch(/status\s+GoalStatus\s+@default\(active\)/);
    expect(schema).toMatch(/endedAt\s+DateTime\?/);
    expect(schema).toContain('@@index([userId, createdAt])');
    expect(migration).toContain('CREATE TYPE "GoalStatus"');
    expect(migration).toMatch(/SET\s+"status" = CASE/);
    expect(migration).toContain('THEN \'replaced\'::"GoalStatus"');
    expect(
      migration.match(/newer\."createdAt" = goal\."createdAt"/g),
    ).toHaveLength(2);
    expect(migration.match(/newer\."id" > goal\."id"/g)).toHaveLength(2);
    expect(migration).toContain('ADD COLUMN "endedAt" TIMESTAMP(3)');
    expect(migration).toContain('CREATE INDEX "Goal_userId_createdAt_idx"');
  });
});
