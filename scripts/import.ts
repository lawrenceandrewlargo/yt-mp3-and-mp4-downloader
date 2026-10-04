import './env';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { importData, exportData, backupLocalDatabase } from '../src/services/data-transfer';
import { readConfig } from '../src/config/env';
import { database } from '../src/db';
try {
  if (!process.argv.includes('--confirm-import') || !process.argv.includes('--input')) throw new Error('Usage: npm run db:import -- --input backups/export.json --confirm-import. Destination must be empty and migrated.');
  const file=process.argv[process.argv.indexOf('--input')+1];
  if(!file||!(await stat(file)).isFile()||(await stat(file)).size>20*1024*1024)throw new Error('Import file must be a regular JSON file under 20 MB.');
  if(readConfig().databaseMode==='local') await backupLocalDatabase();
  else {await mkdir('backups',{recursive:true});await writeFile(`backups/pre-import-${Date.now()}.json`,JSON.stringify(await exportData(),null,2),{flag:'wx'});}
  console.log('Imported application data:',await importData(JSON.parse(await readFile(file,'utf8'))));
} catch(e) {console.error(e instanceof Error&&!(e instanceof SyntaxError)?e.message:'Import failed: invalid JSON.');process.exitCode=1;} finally {database().client.close();}
