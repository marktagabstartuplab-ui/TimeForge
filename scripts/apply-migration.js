/* eslint-disable */
// Applies a single migration.sql file directly using the privileged DIRECT_URL
// connection, bypassing `prisma migrate dev`'s shadow-database diff (which is
// broken against this Supabase instance — see ADR "Migration workflow").
// Usage: node scripts/apply-migration.js prisma/migrations/<name>/migration.sql
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.js <path-to-migration.sql>');
    process.exit(1);
  }
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('DIRECT_URL (or DATABASE_URL) must be set.');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✓ Applied ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
