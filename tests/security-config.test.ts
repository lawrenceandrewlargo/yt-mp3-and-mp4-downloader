import { describe,it,expect } from 'vitest';
import { downloadSchema, validateMediaUrl, safeFilename, within, settingsSchema, currentVideoUrl } from '../src/lib/security';
import { readConfig } from '../src/config/env';
import { parseProgress, compatibleVideo, resolutions, selectFormats } from '../src/media/formats';
import { parseMetadata } from '../src/media/metadata';
import { processError } from '../src/lib/errors';
import path from 'node:path';
const url='https://www.youtube.com/watch?v=fixture';
const request={url,type:'audio' as const,format:'mp3' as const,bitrate:192 as const,resolution:'best' as const,rightsConfirmed:true as const};
describe('URL and filesystem security',()=>{
 it('accepts supported HTTPS and removes fragment',()=>expect(validateMediaUrl(url+'#x')).toBe(url));
 it.each(['http://youtube.com/watch?v=x','file:///etc/passwd','https://127.0.0.1/x','https://localhost/x','https://youtube.com.evil.test/x','https://user:password@youtube.com/x','https://youtube.com:444/x','ytsearch1:test','--exec=evil','not a url'])('rejects unsafe URL %s',v=>expect(()=>validateMediaUrl(v)).toThrow());
 it('never expands playlists implicitly',()=>{expect(currentVideoUrl(url+'&list=123&index=1')).toBe(url);expect(()=>currentVideoUrl('https://youtube.com/playlist?list=123')).toThrow();});
 it.each(['../CON<>:/\\?*','foo..bar','NUL.txt','COM1','track. ',''])('sanitizes filename %s',v=>{const name=safeFilename(v);expect(name).not.toMatch(/[<>:"/\\|?*]|\.\./);expect(name).not.toMatch(/[ .]$/);expect(name.length).toBeGreaterThan(0);});
 it('protects path containment and sibling prefixes',()=>{const root=path.resolve('data/test');expect(within(root,'a.mp3')).toBe(path.join(root,'a.mp3'));expect(()=>within(root,'../test-other/a')).toThrow();expect(()=>within(root,root)).toThrow();});
 it('requires rights and rejects unknown executable fields',()=>{expect(downloadSchema.safeParse({...request,rightsConfirmed:false}).success).toBe(false);expect(downloadSchema.safeParse({...request,executable:'cmd'}).success).toBe(false);expect(downloadSchema.safeParse({...request,exactFormatId:'137 --exec bad'}).success).toBe(false);});
 it('validates formats and bitrate independently',()=>{expect(downloadSchema.safeParse({...request,format:'mkv'}).success).toBe(false);expect(downloadSchema.safeParse({...request,bitrate:200}).success).toBe(false);expect(downloadSchema.parse(request).bitrate).toBe(192);});
 it('caps settings concurrency',()=>expect(settingsSchema.safeParse({concurrency:99}).success).toBe(false));
});
describe('runtime configuration',()=>{
 it('defaults to local SQLite and 2 processes',()=>{const c=readConfig({});expect(c.databaseMode).toBe('local');expect(c.DOWNLOAD_CONCURRENCY).toBe(2);expect(c.cloud).toBe(false);});
 it('uses one connection contract for Turso',()=>expect(readConfig({DATABASE_URL:'libsql://test.turso.io',DATABASE_AUTH_TOKEN:'test'}).databaseMode).toBe('turso'));
 it('never permits persistent SQLite assumptions on Vercel',()=>{expect(()=>readConfig({VERCEL:'1'})).toThrow('Turso');expect(()=>readConfig({VERCEL:'1',MEDIA_EXECUTION_PROVIDER:'local'})).toThrow('Turso');});
 it('requires remote tokens and validates configured limits',()=>{expect(()=>readConfig({DATABASE_URL:'libsql://test'})).toThrow();expect(()=>readConfig({DOWNLOAD_CONCURRENCY:'200'})).toThrow();expect(()=>readConfig({DATABASE_URL:'postgres://test'})).toThrow();});
 it('resolves trusted relative executable paths before job cwd changes',()=>{const config=readConfig({YTDLP_PATH:'./tools/yt-dlp',FFMPEG_PATH:'./tools/ffmpeg',CLOUD_YTDLP_PATH:'./vendor/yt-dlp_linux'});expect(config.YTDLP_PATH).toBe(path.resolve('tools/yt-dlp'));expect(config.FFMPEG_PATH).toBe(path.resolve('tools/ffmpeg'));expect(config.CLOUD_YTDLP_PATH).toBe(path.resolve('vendor/yt-dlp_linux'));expect(readConfig({}).FFMPEG_PATH).toBe('ffmpeg');});
});
const media=parseMetadata({id:'fixture',webpage_url:url,title:'Fixture',formats:[
 {format_id:'a-opus',ext:'webm',vcodec:'none',acodec:'opus',abr:160},
 {format_id:'a-aac',ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:128},
 {format_id:'v720',ext:'mp4',vcodec:'avc1',acodec:'none',height:720,fps:30},
 {format_id:'v1080',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080,fps:30},
 {format_id:'v-vp9',ext:'webm',vcodec:'vp9',acodec:'none',height:720},
 {format_id:'drm',ext:'mp4',vcodec:'avc1',acodec:'none',height:2160,has_drm:true},
]},url);
describe('format discovery and selection',()=>{
 it('excludes DRM and uses source resolutions',()=>expect(resolutions(media,'mp4')).toEqual([1080,720]));
 it('selects video + compatible audio dynamically',()=>expect(selectFormats(media,{...request,type:'video',format:'mp4',resolution:720}).selector).toBe('v720+a-aac'));
 it('selects WebM codecs and rejects incompatible streams',()=>{expect(selectFormats(media,{...request,type:'video',format:'webm'}).selector).toBe('v-vp9+a-opus');expect(compatibleVideo(media.formats[2],'webm')).toBe(false);});
 it('never advertises or synthesizes missing resolution',()=>expect(()=>selectFormats(media,{...request,type:'video',format:'mp4',resolution:2160})).toThrow());
 it('prefers a native compatible source for Auto',()=>expect(selectFormats(media,{...request,format:'m4a',bitrate:'auto'}).selector).toBe('a-aac'));
 it('uses the best source for a requested output bitrate',()=>expect(selectFormats(media,{...request,bitrate:320}).source.audioBitrate).toBe(160));
 it('does not offer resolutions without a compatible audio source',()=>{const silent={...media,formats:media.formats.filter(f=>f.videoCodec!=='none')};expect(resolutions(silent,'mp4')).toEqual([]);expect(()=>selectFormats(silent,{...request,type:'video',format:'mp4'})).toThrow();});
 it('Best chooses a playable combined stream when higher video lacks compatible audio',()=>{const mixed=parseMetadata({formats:[{format_id:'silent',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080},{format_id:'combined',ext:'mp4',vcodec:'avc1',acodec:'aac',height:720}]},url);expect(resolutions(mixed,'mp4')).toEqual([720]);expect(selectFormats(mixed,{...request,type:'video',format:'mp4'}).selector).toBe('combined');});
 it.each([['flac','flac'],['wav','pcm_s24le']])('Auto prefers native %s sources', (format,codec)=>{const native=parseMetadata({formats:[{format_id:'lossy',acodec:'opus',vcodec:'none',abr:192},{format_id:'native',acodec:codec,vcodec:'none'}]},url);expect(selectFormats(native,{...request,format:format as 'flac'|'wav',bitrate:'auto'}).selector).toBe('native');});
 it('reports exact video-only formats as silent',()=>expect(selectFormats(media,{...request,type:'video',format:'mkv',exactFormatId:'v720'}).hasAudio).toBe(false));
 it('rejects missing exact formats and audio from silent source',()=>{expect(()=>selectFormats(media,{...request,exactFormatId:'bad'})).toThrow();expect(()=>selectFormats(media,{...request,exactFormatId:'v720'})).toThrow();});
 it('keeps null and estimated metadata explicit',()=>{const m=parseMetadata({title:'Title',formats:[{format_id:'a',ext:'m4a',acodec:'aac',vcodec:'none',filesize_approx:1234}]},url);expect(m.duration).toBeNull();expect(m.formats[0].estimated).toBe(true);});
});
describe('real progress and helpful errors',()=>{
 it('parses numeric progress without inventing totals',()=>{expect(parseProgress('PROGRESS:{"downloaded_bytes":5,"total_bytes":10,"speed":3,"eta":2}')?.percent).toBe(50);expect(parseProgress('PROGRESS:{"downloaded_bytes":5}')?.percent).toBeUndefined();});
 it('ignores malformed/unstructured progress',()=>{expect(parseProgress('PROGRESS:bad')).toBeNull();expect(parseProgress('[download] 50%')).toBeNull();});
 it.each([['Private video','RESTRICTED'],['Video removed','UNAVAILABLE'],['HTTP Error 403','NETWORK'],['Requested format is not available','FORMAT'],['No space left on device','DISK_FULL'],['ffmpeg conversion error','PROCESSING']])('classifies %s',(text,code)=>expect(processError(text).code).toBe(code));
});
