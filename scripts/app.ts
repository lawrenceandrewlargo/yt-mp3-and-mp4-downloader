import './env';
import { spawn } from 'node:child_process';
import { readConfig } from '../src/config/env';
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
if (!process.version.startsWith('v24.')) throw new Error('This application requires Node.js 24.x.');
const config = readConfig();
const children = [spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, '--hostname', '127.0.0.1'], { stdio: 'inherit', windowsHide: true })];
if (!config.cloud) children.push(spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], { stdio: ['inherit','inherit','inherit','ipc'], windowsHide: true }));
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) { if (child.connected) child.send({type:'shutdown'}); else child.kill('SIGTERM'); } }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) {
  child.on('error', () => { console.error('The application could not launch a child process. Check Node.js 24 and local process permissions.'); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
