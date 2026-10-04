import './env';
import { backupLocalDatabase } from '../src/services/data-transfer';
import { database } from '../src/db';
try { console.log(`Consistent SQLite snapshot: ${await backupLocalDatabase()}`); } catch(e) { console.error(e instanceof Error?e.message:'Backup failed.');process.exitCode=1; } finally { database().client.close(); }
