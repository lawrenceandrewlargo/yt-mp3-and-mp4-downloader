import './env';
import { writeFile, mkdir } from 'node:fs/promises';
import { exportData } from '../src/services/data-transfer';
import { database } from '../src/db';
try { await mkdir('backups',{recursive:true});const file=`backups/export-${Date.now()}.json`;await writeFile(file,JSON.stringify(await exportData(),null,2),{flag:'wx'});console.log(`Portable application data: ${file}`); } catch {console.error('Export failed. Check database connectivity and filesystem permissions.');process.exitCode=1;} finally {database().client.close();}
