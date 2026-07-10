/* eslint-disable */
// Applies prisma/sql/rls.sql using the privileged DIRECT_URL connection.
// Usage: npm run db:rls   (requires DIRECT_URL in the environment / .env)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('DIRECT_URL (or DATABASE_URL) must be set.');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'sql', 'rls.sql'), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✓ RLS policies + app role applied.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
