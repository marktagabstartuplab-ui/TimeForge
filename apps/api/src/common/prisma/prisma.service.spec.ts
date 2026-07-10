import { readFileSync } from 'fs';
import { join } from 'path';
import { TENANT_MODELS } from './prisma.service';

/**
 * Parses prisma/schema.prisma and returns every model name that declares a
 * `tenantId String @map("tenant_id")` field — the ground truth for "this
 * model is tenant-scoped and must be in TENANT_MODELS".
 */
function findTenantScopedModels(): string[] {
  const schemaPath = join(__dirname, '../../../../../prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf-8');

  const models: string[] = [];
  const modelBlockRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelBlockRegex.exec(schema)) !== null) {
    const [, modelName, body] = match;
    if (/tenantId\s+String\s+@map\("tenant_id"\)/.test(body)) {
      models.push(modelName);
    }
  }
  return models;
}

describe('PrismaService TENANT_MODELS', () => {
  it('covers every tenant-scoped model in the schema — no gap left to developer discipline', () => {
    const schemaModels = findTenantScopedModels().sort();
    const registeredModels = [...TENANT_MODELS].sort();

    const missing = schemaModels.filter((m) => !TENANT_MODELS.has(m));
    const stale = registeredModels.filter((m) => !schemaModels.includes(m));

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('found a non-trivial number of tenant-scoped models (sanity check the parser itself works)', () => {
    expect(findTenantScopedModels().length).toBeGreaterThan(20);
  });
});
