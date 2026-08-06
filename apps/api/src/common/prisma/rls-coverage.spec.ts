import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Layer 4 of tenant isolation is the RLS policy set in `prisma/sql/rls.sql`.
 * Its table list is hand-maintained, and nothing previously checked it against
 * the schema — three tenant-scoped tables (`recurring_issues`,
 * `payroll_settings`, `employee_calendar_events`) had silently drifted out of
 * it, plus the four employee-relations tables before them.
 *
 * `prisma.service.spec.ts` guards the *middleware* list (layer 3) the same way.
 * This guards the *database* list, so a new tenant-scoped model cannot ship
 * with the backstop missing.
 */

const REPO_ROOT = join(__dirname, '../../../../..');

/** Every tenant-scoped model in the schema, as its physical table name. */
function tenantScopedTables(): string[] {
  const schema = readFileSync(join(REPO_ROOT, 'prisma/schema.prisma'), 'utf-8');
  const tables: string[] = [];

  // Non-greedy up to a closing brace in column 0, so nested `{}` in attributes
  // (e.g. `@default(dbgenerated("..."))`) cannot end the block early.
  const modelBlock = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelBlock.exec(schema)) !== null) {
    const [, modelName, body] = match;
    if (!/^\s*tenantId\s/m.test(body)) continue;
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    tables.push(mapped ? mapped[1] : modelName);
  }
  return tables;
}

/** The `tenant_tables` array literal that rls.sql loops over. */
function policiedTables(): string[] {
  const sql = readFileSync(join(REPO_ROOT, 'prisma/sql/rls.sql'), 'utf-8');
  const arrayLiteral = sql.match(/tenant_tables text\[\] := ARRAY\[([\s\S]*?)\];/);
  if (!arrayLiteral) {
    throw new Error('Could not find the tenant_tables ARRAY[...] literal in rls.sql');
  }
  // Strip `-- …` line comments first. The list is heavily commented, and an
  // apostrophe in prose ("the employee's calendar") would otherwise open a
  // bogus quote and swallow the surrounding text as a table name.
  const withoutComments = arrayLiteral[1].replace(/--[^\n]*/g, '');
  return [...withoutComments.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('rls.sql tenant policy coverage', () => {
  it('has a tenant_isolation policy for every tenant-scoped table in the schema', () => {
    const schemaTables = tenantScopedTables().sort();
    const policied = new Set(policiedTables());

    const missing = schemaTables.filter((t) => !policied.has(t));

    expect(missing).toEqual([]);
  });

  it('lists no table that no longer exists in the schema', () => {
    const schemaTables = new Set(tenantScopedTables());
    const stale = policiedTables()
      .filter((t) => !schemaTables.has(t))
      .sort();

    // A stale entry makes `npm run db:rls` fail outright on a fresh database —
    // ALTER TABLE on a table that was renamed or dropped is a hard error.
    expect(stale).toEqual([]);
  });

  it('parses both files (sanity check the regexes still match the file formats)', () => {
    expect(tenantScopedTables().length).toBeGreaterThan(20);
    expect(policiedTables().length).toBeGreaterThan(20);
  });
});
