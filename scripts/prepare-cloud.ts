import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Explicit opt-in to the official Linux standalone executable, never a third-party wrapper.
const release=await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest').then(r=>{if(!r.ok)throw new Error('Could not read official yt-dlp release.');return r.json();}) as {assets:{name:string;browser_download_url:string}[];tag_name:string};
const binary=release.assets.find(a=>a.name==='yt-dlp_linux'),checksums=release.assets.find(a=>a.name==='SHA2-256SUMS');
if(!binary||!checksums)throw new Error('Official release assets were not found.');
const [buffer,sums]=await Promise.all([fetch(binary.browser_download_url).then(async r=>{if(!r.ok)throw new Error('Binary download failed.');return Buffer.from(await r.arrayBuffer());}),fetch(checksums.browser_download_url).then(r=>r.text())]);
const hash=createHash('sha256').update(buffer).digest('hex');
if(!sums.split('\n').some(line=>line.startsWith(hash)&&/\s\*?yt-dlp_linux\s*$/.test(line)))throw new Error('Official checksum did not match.');
await mkdir('vendor',{recursive:true});await writeFile('vendor/yt-dlp_linux',buffer,{mode:0o755});await writeFile('vendor/version.txt',release.tag_name);
console.log(`Prepared official yt-dlp ${release.tag_name}; configure CLOUD_YTDLP_PATH=./vendor/yt-dlp_linux on Vercel. Cloud metadata still requires live deployment testing.`);
