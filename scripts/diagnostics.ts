import './env';
import { diagnostics } from '../src/media/diagnostics';
import { database } from '../src/db';
try { console.log(JSON.stringify(await diagnostics(), null, 2)); database().client.close(); } catch { console.error('Diagnostics could not start. Check documented database and runtime configuration.'); process.exitCode = 1; }
