// Writes the schema to supabase/migrations so it can be applied with the Supabase CLI or SQL editor.
import fs from 'node:fs';
import { SCHEMA_SQL, SCHEMA_VERSION } from '../lib/db/schema-sql';
fs.mkdirSync('supabase/migrations', { recursive: true });
fs.writeFileSync(
  'supabase/migrations/0001_init.sql',
  `-- Wealthwise schema v${SCHEMA_VERSION} (generated from lib/db/schema-sql.ts — edit that file, then run: npm run db:sql)\n` +
    SCHEMA_SQL +
    `\ninsert into schema_meta(key,value) values('version','${SCHEMA_VERSION}') on conflict(key) do update set value=excluded.value;\n`,
);
console.log('wrote supabase/migrations/0001_init.sql');
