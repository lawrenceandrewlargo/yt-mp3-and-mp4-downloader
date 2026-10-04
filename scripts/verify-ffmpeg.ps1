$ErrorActionPreference = 'Stop'
$workspacePath = (Get-Location).Path
$fixtureRoot = Join-Path $workspacePath ('data/ffmpeg-fixtures-' + [guid]::NewGuid().ToString())
if (-not ([System.IO.Path]::GetFullPath($fixtureRoot).StartsWith($workspacePath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) { throw 'Unsafe fixture path.' }
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
function Run-FFmpeg([string[]]$Arguments) { & ffmpeg -hide_banner -loglevel error -nostdin @Arguments; if ($LASTEXITCODE -ne 0) { throw 'FFmpeg fixture command failed.' } }
function Probe([string]$File) { $result = & ffprobe -v error -show_streams -show_format -of json $File; if ($LASTEXITCODE -ne 0) { throw 'ffprobe fixture check failed.' }; return ($result | ConvertFrom-Json) }
try {
  $source = Join-Path $fixtureRoot 'source-1080.mp4'
  Run-FFmpeg @('-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-threads','2','-preset','ultrafast','-c:a','aac',$source)
  foreach ($bitrate in @(128,192,320)) {
    $output = Join-Path $fixtureRoot ('output-' + $bitrate + '.mp3')
    Run-FFmpeg @('-y','-i',$source,'-map','0:a:0','-c:a','libmp3lame','-b:a',($bitrate.ToString() + 'k'),'-vn',$output)
    $stream = (Probe $output).streams | Where-Object { $_.codec_type -eq 'audio' }
    if ($stream.codec_name -ne 'mp3' -or [Math]::Abs([double]$stream.bit_rate - ($bitrate * 1000)) -gt 2000) { throw 'MP3 output bitrate was incorrect.' }
    Write-Output ('PASS actual FFmpeg MP3 ' + $bitrate + ' kbps')
  }
  foreach ($pair in @(@('m4a','copy'),@('opus','libopus'),@('flac','flac'),@('wav','pcm_s16le'),@('aac','aac'))) {
    $output = Join-Path $fixtureRoot ('output.' + $pair[0])
    Run-FFmpeg @('-y','-i',$source,'-map','0:a:0','-c:a',$pair[1],'-vn',$output)
    if (-not ((Probe $output).streams | Where-Object { $_.codec_type -eq 'audio' })) { throw 'Audio stream missing.' }
    Write-Output ('PASS actual FFmpeg audio ' + $pair[0])
  }
  $videoOnly = Join-Path $fixtureRoot 'video-720.mp4'
  Run-FFmpeg @('-y','-i',$source,'-an','-vf','scale=1280:720','-c:v','libx264','-threads','2','-preset','ultrafast',$videoOnly)
  $merged = Join-Path $fixtureRoot 'merged-720.mp4'
  Run-FFmpeg @('-y','-i',$videoOnly,'-i',(Join-Path $fixtureRoot 'output.m4a'),'-map','0:v:0','-map','1:a:0','-c','copy',$merged)
  $probe = Probe $merged
  if (($probe.streams | Where-Object { $_.codec_type -eq 'video' }).height -ne 720 -or -not ($probe.streams | Where-Object { $_.codec_type -eq 'audio' })) { throw '720p video merge failed.' }
  Write-Output 'PASS actual FFmpeg 720p MP4 merge with audio'
  $mkv = Join-Path $fixtureRoot 'output-1080.mkv'
  Run-FFmpeg @('-y','-i',$source,'-map','0:v:0','-map','0:a:0','-c','copy',$mkv)
  $probe = Probe $mkv
  if (($probe.streams | Where-Object { $_.codec_type -eq 'video' }).height -ne 1080 -or -not ($probe.streams | Where-Object { $_.codec_type -eq 'audio' })) { throw '1080p MKV remux failed.' }
  Write-Output 'PASS actual FFmpeg 1080p MKV remux with audio'
  $webm = Join-Path $fixtureRoot 'output-720.webm'
  Run-FFmpeg @('-y','-i',$source,'-vf','scale=1280:720','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-threads','2','-c:a','libopus',$webm)
  $probe = Probe $webm
  if (($probe.streams | Where-Object { $_.codec_type -eq 'video' }).height -ne 720 -or ($probe.streams | Where-Object { $_.codec_type -eq 'audio' }).codec_name -ne 'opus') { throw 'WebM codec/container verification failed.' }
  Write-Output 'PASS actual FFmpeg 720p WebM with Opus audio'
  $cover = Join-Path $fixtureRoot 'cover.jpg'
  Run-FFmpeg @('-y','-f','lavfi','-i','color=c=blue:size=128x128','-frames:v','1',$cover)
  foreach ($pair in @(@('mp3','libmp3lame'),@('m4a','aac'),@('flac','flac'))) {
    $output = Join-Path $fixtureRoot ('cover.' + $pair[0])
    Run-FFmpeg @('-y','-i',$source,'-i',$cover,'-map','0:a:0','-map','1:v:0','-c:a',$pair[1],'-c:v','mjpeg','-disposition:v:0','attached_pic','-metadata','title=Fixture title','-metadata','artist=Fixture owner',$output)
    $probe = Probe $output
    if (-not ($probe.streams | Where-Object { $_.disposition.attached_pic -eq 1 }) -or $probe.format.tags.title -ne 'Fixture title') { throw 'Cover/title metadata verification failed.' }
    Write-Output ('PASS actual FFmpeg cover/title embedding ' + $pair[0])
  }
} finally { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
