import './env';
import { capabilities } from '../src/media/diagnostics';
import { MediaMetadataService,MediaSearchService } from '../src/media/metadata';
import { validateMediaUrl } from '../src/lib/security';
try {
 const caps=await capabilities(true);
 if(!caps.ytdlp.detected)throw new Error(caps.ytdlp.message||'yt-dlp unavailable.');
 const query=process.env.TEST_SEARCH_QUERY||'Blender Foundation Big Buck Bunny';
 const results=await new MediaSearchService().search(query);
 if(!results.length)throw new Error('Search returned no results.');console.log(`PASS search: ${results.length} results`);
 const service=new MediaMetadataService();const selected=await service.analyze(results[0].url);console.log(`PASS selected result analysis: ${selected.formats.length} formats`);
 const url=validateMediaUrl(process.env.TEST_MEDIA_URL||'https://www.youtube.com/watch?v=BaW_jenozKc');
 const media=await service.analyze(url);if(!media.formats.length)throw new Error('No available formats.');console.log(`PASS URL analysis: ${media.formats.length} formats`);
 console.log('This network test does not download media. Use the local UI with content you have rights to download for live queue/cancellation tests.');
}catch(error){console.error(`YouTube integration did not pass: ${error instanceof Error?error.message:'Unknown failure'}`);process.exitCode=1;}
