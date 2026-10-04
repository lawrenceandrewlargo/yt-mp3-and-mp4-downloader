import { beforeEach,describe,it,expect,vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
const spawnMock=vi.fn();
const spawner=spawnMock as unknown as typeof spawn;
import { runProcess } from '../src/media/execution/process';
const options={tempRoot:'data/tmp/process-tests',timeoutMs:1000};
function fakeChild() { return Object.assign(new EventEmitter(),{pid:1234,stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()}); }
beforeEach(()=>spawnMock.mockReset());
describe('safe media process boundary',()=>{
 it('uses argument arrays, no shell, and excludes database secrets',async()=>{
  const child=fakeChild();spawnMock.mockReturnValue(child);process.env.DATABASE_AUTH_TOKEN='should-never-be-forwarded';
  const promise=runProcess('yt-dlp',['--','https://youtube.com/watch?v=x&value=literal'],options,spawner);
  await vi.waitFor(()=>expect(spawnMock).toHaveBeenCalled());child.stdout.end('{"ok":true}\n');child.emit('close',0);
  expect(await promise).toContain('ok');expect(spawnMock.mock.calls[0][1]).toEqual(['--','https://youtube.com/watch?v=x&value=literal']);expect(spawnMock.mock.calls[0][2].shell).toBe(false);expect(spawnMock.mock.calls[0][2].env.DATABASE_AUTH_TOKEN).toBeUndefined();delete process.env.DATABASE_AUTH_TOKEN;
 });
 it('provides helpful missing-tool errors',async()=>{
  const child=fakeChild();spawnMock.mockReturnValue(child);const promise=runProcess('ffmpeg',['-version'],options,spawner);const rejection=expect(promise).rejects.toThrow('FFmpeg could not start');await vi.waitFor(()=>expect(spawnMock).toHaveBeenCalled());child.emit('error',Object.assign(new Error('missing'),{code:'ENOENT'}));await rejection;
 });
 it('converts synchronous sandbox errors to helpful messages',async()=>{const blocked=(()=>{throw Object.assign(new Error('spawn EPERM'),{code:'EPERM'});}) as unknown as typeof spawn; let failure: unknown; try { await runProcess('yt-dlp',[],options,blocked); } catch (error) { failure=error; } expect(failure).toMatchObject({code:'PROCESS_BLOCKED'});});
 it('terminates the owned process tree on cancellation and waits for closure',async()=>{
  const child=fakeChild(),killer=fakeChild();spawnMock.mockReturnValueOnce(child).mockReturnValue(killer);const controller=new AbortController();const promise=runProcess('yt-dlp',[],{...options,signal:controller.signal},spawner);const rejection=expect(promise).rejects.toThrow('cancelled');await vi.waitFor(()=>expect(spawnMock).toHaveBeenCalled());controller.abort();
  if(process.platform==='win32')expect(spawnMock.mock.calls[1][1]).toEqual(['/PID','1234','/T','/F']);
  child.emit('close',null);await rejection;
 });
 it('classifies tool network errors and clears timeouts',async()=>{const child=fakeChild();spawnMock.mockReturnValue(child);const promise=runProcess('yt-dlp',[],options,spawner);const rejection=expect(promise).rejects.toThrow('network');await vi.waitFor(()=>expect(spawnMock).toHaveBeenCalled());child.stderr.end('HTTP Error 403');child.emit('close',1);await rejection;});
 it('handles malformed final output without an uncaught callback error',async()=>{const child=fakeChild();spawnMock.mockReturnValue(child);const promise=runProcess('yt-dlp',[],{...options,onLine:()=>{throw new Error('invalid JSON');}},spawner);const rejection=expect(promise).rejects.toThrow('Unexpected media progress');await vi.waitFor(()=>expect(spawnMock).toHaveBeenCalled());child.stdout.end('FILE:malformed');child.emit('close',0);await rejection;});
});
