import './env';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdir,copyFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../src/config/env';
import { LocalMediaExecutionProvider, type MediaExecutionProvider } from '../src/media/execution/provider';
import { runDownload } from '../src/media/download/pipeline';
import { settingsSchema } from '../src/lib/security';
import type { DownloadRequest } from '../src/lib/security';

// Real FFmpeg/ffprobe integration with self-created video/audio.
// yt-dlp network extraction is exercised separately by test:youtube.
const root=path.resolve('data',`integration-${randomUUID()}`);
const config=readConfig({...process.env,TEMP_DIRECTORY:path.join(root,'tmp'),DOWNLOAD_DIRECTORY:path.join(root,'out')});
const local=new LocalMediaExecutionProvider(config);
await mkdir(root,{recursive:true});
const url='https://media.w3.org/fixture-owned-by-this-test';
try {
  await local.ffmpeg(['-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-preset','ultrafast','-c:a','aac',path.join(root,'1080.mp4')]);
  await local.ffmpeg(['-y','-i',path.join(root,'1080.mp4'),'-vf','scale=1280:720','-c:v','libx264','-preset','ultrafast','-c:a','copy',path.join(root,'720.mp4')]);
  const provider:MediaExecutionProvider={kind:'local',ffmpeg:(args,options)=>local.ffmpeg(args,options),ffprobe:(args,options)=>local.ffprobe(args,options),ytdlp:async(args,options)=>{
    if(args.includes('--skip-download'))return JSON.stringify({id:'fixture',title:'Owned test media',uploader:'Test',webpage_url:url,formats:[{format_id:'720',ext:'mp4',vcodec:'avc1',acodec:'mp4a.40.2',height:720},{format_id:'1080',ext:'mp4',vcodec:'avc1',acodec:'mp4a.40.2',height:1080}]});
    const file=path.join(options!.cwd!,'source.mp4');const selector=args[args.indexOf('--format')+1];await copyFile(path.join(root,selector==='720'?'720.mp4':'1080.mp4'),file);options?.onLine?.(`FILE:${JSON.stringify(file)}`);return '';
  }};
  const cases:Partial<DownloadRequest>[]=[{format:'mp3',bitrate:128},{format:'mp3',bitrate:192},{format:'mp3',bitrate:320},{format:'m4a',bitrate:'auto'},{format:'opus',bitrate:128},{format:'aac',bitrate:128},{format:'flac',bitrate:'auto'},{format:'wav',bitrate:'auto'},{type:'video',format:'mp4',resolution:720},{type:'video',format:'mkv',resolution:1080}];
  for(const value of cases){
    const request:DownloadRequest={url,type:'audio',format:'mp3',bitrate:192,resolution:'best',rightsConfirmed:true,...value};
    const output=await runDownload(config,provider,randomUUID(),request,settingsSchema.parse({}),new AbortController().signal,{update:()=>{},metadata:async()=>{}});
    const probe=JSON.parse(await local.ffprobe(['-v','error','-show_streams','-of','json',path.join(config.downloadRoot,output.relativePath)])) as {streams:{codec_type:string;codec_name:string;bit_rate?:string;height?:number}[]};
    assert(probe.streams.some(s=>s.codec_type==='audio'));
    if(request.format==='mp3'){const stream=probe.streams.find(s=>s.codec_type==='audio')!;assert.equal(stream.codec_name,'mp3');assert(Math.abs(Number(stream.bit_rate)-Number(request.bitrate)*1000)<2000);}
    if(request.type==='video')assert.equal(probe.streams.find(s=>s.codec_type==='video')?.height,request.resolution);
    console.log(`PASS real FFmpeg output: ${request.format} / ${request.type==='audio'?request.bitrate:request.resolution}`);
  }
} catch(error) { console.error(`Integration did not pass: ${error instanceof Error?error.message:'Unknown failure'}`);process.exitCode=1; }
finally { await rm(root,{recursive:true,force:true}); }
