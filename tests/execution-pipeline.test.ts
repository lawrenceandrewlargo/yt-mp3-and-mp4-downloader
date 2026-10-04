import { describe,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile,rm,readdir } from 'node:fs/promises';
import path from 'node:path';
import { MediaMetadataService,MediaSearchService } from '../src/media/metadata';
import { MetadataExecutionProvider, type MediaExecutionProvider } from '../src/media/execution/provider';
import { readConfig } from '../src/config/env';
import { runDownload } from '../src/media/download/pipeline';
import { settingsSchema } from '../src/lib/security';
import { publishFile } from '../src/media/download/storage';
import type { ProcessOptions } from '../src/media/execution/process';
const url='https://youtube.com/watch?v=fixture';
const raw={id:'fixture',title:'Test / title',uploader:'Owner',webpage_url:url,formats:[{format_id:'aac',ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:128},{format_id:'video',ext:'mp4',vcodec:'avc1',acodec:'none',height:720}]};
describe('metadata/search services',()=>{
 it('searches 15 results and requires a separate analysis',async()=>{const ytdlp=vi.fn().mockResolvedValue(JSON.stringify({entries:[{...raw,duration:10}]}));const p={kind:'local',ytdlp,ffmpeg:vi.fn(),ffprobe:vi.fn()} as MediaExecutionProvider;const result=await new MediaSearchService(p).search('example');expect(result).toHaveLength(1);expect(ytdlp.mock.calls[0][0]).toContain('ytsearch15:example');expect(ytdlp.mock.calls[0][0]).toContain('--skip-download');expect(await new MediaMetadataService({...p,ytdlp:vi.fn().mockResolvedValue(JSON.stringify(raw))}).analyze(url)).toHaveProperty('formats');});
 it('rejects malformed tool output',async()=>{const p={kind:'local',ytdlp:vi.fn().mockResolvedValue('not json'),ffmpeg:vi.fn(),ffprobe:vi.fn()} as MediaExecutionProvider;await expect(new MediaMetadataService(p).analyze(url)).rejects.toThrow('unexpected metadata');});
 it('rejects extractor playlist responses during single-media analysis',async()=>{const p={kind:'local',ytdlp:vi.fn().mockResolvedValue(JSON.stringify({_type:'playlist',entries:[raw]})),ffmpeg:vi.fn(),ffprobe:vi.fn()} as MediaExecutionProvider;await expect(new MediaMetadataService(p).analyze(url)).rejects.toThrow('Playlist');});
 it('cloud provider refuses downloads and reports missing binary',async()=>{const p=new MetadataExecutionProvider(readConfig({MEDIA_EXECUTION_PROVIDER:'metadata',DATABASE_URL:'libsql://fixture',DATABASE_AUTH_TOKEN:'test'}));await expect(p.ytdlp(['--skip-download'])).rejects.toThrow('packaged');await expect(p.ffmpeg()).rejects.toThrow('Local');});
});
describe('pipeline orchestration with mocked external processes',()=>{
 it('never reuses or deletes a pre-existing job workspace',async()=>{const root=path.resolve('data',`owned-${randomUUID()}`),id=randomUUID(),config=readConfig({TEMP_DIRECTORY:path.join(root,'tmp')});const workspace=path.join(config.tempRoot,id);await mkdir(workspace,{recursive:true});await writeFile(path.join(workspace,'keep'),'unrelated');const p={kind:'local',ytdlp:vi.fn(),ffmpeg:vi.fn(),ffprobe:vi.fn()} as MediaExecutionProvider;try{await expect(runDownload(config,p,id,{url,type:'audio',format:'mp3',bitrate:192,resolution:'best',rightsConfirmed:true},settingsSchema.parse({}),new AbortController().signal,{update:vi.fn(),metadata:vi.fn()})).rejects.toThrow();expect(await readFile(path.join(workspace,'keep'),'utf8')).toBe('unrelated');expect(p.ytdlp).not.toHaveBeenCalled();}finally{await rm(root,{recursive:true,force:true});}});
 it.each([128,192,320])('requests actual MP3 %i kbps encoding',async bitrate=>{
  const root=path.resolve('data',`pipeline-${randomUUID()}`);const config=readConfig({TEMP_DIRECTORY:path.join(root,'tmp'),DOWNLOAD_DIRECTORY:path.join(root,'downloads')});const id=randomUUID();const workspace=path.join(config.tempRoot,id);const source=path.join(workspace,'source.m4a');const ffmpeg=vi.fn(async(args:string[])=>{await writeFile(args.at(-1)!,'fixture');return '';});
    const p:MediaExecutionProvider={kind:'local',ytdlp:async(args,options)=>{if(args.includes('--skip-download'))return JSON.stringify(raw);expect(args).not.toContain('--ffmpeg-location');await mkdir(workspace,{recursive:true});await writeFile(source,'fixture');options?.onLine?.(`FILE:${JSON.stringify(source)}`);return '';},ffmpeg,ffprobe:async()=>JSON.stringify({streams:[{codec_type:'audio'}]})};
  try{const result=await runDownload(config,p,id,{url,type:'audio',format:'mp3',bitrate,resolution:'best',rightsConfirmed:true},settingsSchema.parse({}),new AbortController().signal,{update:vi.fn(),metadata:vi.fn()});expect(ffmpeg.mock.calls[0][0]).toEqual(expect.arrayContaining(['-c:a','libmp3lame','-b:a',`${bitrate}k`]));expect(result.filename).toBe('Test _ title.mp3');expect(await readdir(config.tempRoot)).toEqual([]);}finally{await rm(root,{recursive:true,force:true});}
 });
 it('Auto copies native AAC and never claims source restoration',async()=>{
  const root=path.resolve('data',`auto-${randomUUID()}`),id=randomUUID();const config=readConfig({TEMP_DIRECTORY:path.join(root,'tmp'),DOWNLOAD_DIRECTORY:path.join(root,'out')});let ffArgs:string[]=[];const p:MediaExecutionProvider={kind:'local',ytdlp:async(args,o)=>{if(args.includes('--skip-download'))return JSON.stringify(raw);const source=path.join(config.tempRoot,id,'source.m4a');await writeFile(source,'fixture');o?.onLine?.(`FILE:${JSON.stringify(source)}`);return '';},ffmpeg:async args=>{ffArgs=args;await writeFile(args.at(-1)!,'fixture');return '';},ffprobe:async()=>JSON.stringify({streams:[{codec_type:'audio'}]})};
  try{await runDownload(config,p,id,{url,type:'audio',format:'m4a',bitrate:'auto',resolution:'best',rightsConfirmed:true},settingsSchema.parse({}),new AbortController().signal,{update:vi.fn(),metadata:vi.fn()});expect(ffArgs).toEqual(expect.arrayContaining(['-c:a','copy']));expect(ffArgs).not.toContain('-b:a');}finally{await rm(root,{recursive:true,force:true});}
 });
 it('cancellation cleans only the owned temporary directory',async()=>{
  const root=path.resolve('data',`cancel-${randomUUID()}`),id=randomUUID();const config=readConfig({TEMP_DIRECTORY:path.join(root,'tmp')});await mkdir(path.join(config.tempRoot,'unrelated'),{recursive:true});await writeFile(path.join(config.tempRoot,'unrelated','keep.txt'),'keep');const p:MediaExecutionProvider={kind:'local',ytdlp:async()=>{throw new DOMException('Aborted','AbortError');},ffmpeg:vi.fn(),ffprobe:vi.fn()};
  try{await expect(runDownload(config,p,id,{url,type:'audio',format:'mp3',bitrate:192,resolution:'best',rightsConfirmed:true},settingsSchema.parse({}),new AbortController().signal,{update:vi.fn(),metadata:vi.fn()})).rejects.toThrow();expect(await readFile(path.join(config.tempRoot,'unrelated','keep.txt'),'utf8')).toBe('keep');expect(await readdir(config.tempRoot)).toEqual(['unrelated']);}finally{await rm(root,{recursive:true,force:true});}
 });
 it('refuses output without required audio',async()=>{
  const root=path.resolve('data',`silent-${randomUUID()}`),id=randomUUID();const config=readConfig({TEMP_DIRECTORY:path.join(root,'tmp'),DOWNLOAD_DIRECTORY:path.join(root,'out')});const p:MediaExecutionProvider={kind:'local',ytdlp:async(args,o:Partial<ProcessOptions>={})=>{if(args.includes('--skip-download'))return JSON.stringify(raw);const source=path.join(config.tempRoot,id,'source.m4a');await writeFile(source,'fixture');o.onLine?.(`FILE:${JSON.stringify(source)}`);return '';},ffmpeg:async args=>{await writeFile(args.at(-1)!,'fixture');return '';},ffprobe:async()=>JSON.stringify({streams:[{codec_type:'video'}]})};
  try{await expect(runDownload(config,p,id,{url,type:'audio',format:'mp3',bitrate:192,resolution:'best',rightsConfirmed:true},settingsSchema.parse({}),new AbortController().signal,{update:vi.fn(),metadata:vi.fn()})).rejects.toThrow('no audio');}finally{await rm(root,{recursive:true,force:true});}
 });
});
describe('filename collision publication',()=>{
 it('atomically renames concurrent outputs, skips, and overwrites only explicitly',async()=>{
  const root=path.resolve('data',`files-${randomUUID()}`);await mkdir(root,{recursive:true});const source=path.join(root,'input');await writeFile(source,'a');try{const [a,b]=await Promise.all([publishFile(source,path.join(root,'out'),'audio','same','mp3','rename'),publishFile(source,path.join(root,'out'),'audio','same','mp3','rename')]);expect(a.filename).not.toBe(b.filename);expect((await publishFile(source,path.join(root,'out'),'audio','same','mp3','skip')).skipped).toBe(true);await writeFile(source,'b');await publishFile(source,path.join(root,'out'),'audio','same','mp3','overwrite');expect(await readFile(path.join(root,'out','audio','same.mp3'),'utf8')).toBe('b');}finally{await rm(root,{recursive:true,force:true});}
 });
});
