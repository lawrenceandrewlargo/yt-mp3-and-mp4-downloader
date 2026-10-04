import './env';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { database } from '../src/db';
try {
  const { db, client } = database();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Versioned migrations applied successfully.');
  client.close();
} catch { console.error('Migration failed. Check database configuration, connectivity and migration files. No secrets were printed.'); process.exitCode = 1; }
