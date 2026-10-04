# Media pipeline

Bare tool names use PATH discovery. Trusted executable paths containing a directory
are resolved at startup before changing to a job workspace. `--ffmpeg-location` is
passed to yt-dlp only for a configured filesystem path; its default PATH command
is not a location according to the [official implementation](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/postprocessor/ffmpeg.py).

## Discovery

Search uses the documented `ytsearch15:<query>` extractor input with
`--flat-playlist --skip-download --dump-single-json`. Selecting a result invokes
a separate complete metadata analysis. URL analysis uses `--no-playlist` and
`--skip-download`; it never downloads media. YouTube watch URLs containing a
playlist ID have the list/index removed for current-video analysis.

Playlist viewing is a separate flat extraction capped at 50 entries. The UI shows
the reported total when available and states the cap. Select one entry at a time;
batch playlist downloading is deliberately not implemented.

The parser validates JSON, normalizes missing fields, excludes DRM/storyboard
formats, and exposes IDs, extension/container, dimensions, FPS, codecs, bitrates,
file size/estimate, and dynamic range. DRM circumvention, cookies, credential
forwarding, paywall/region bypasses, and arbitrary yt-dlp flags are not implemented.
Metadata is re-extracted when a job starts, rather than treating old format IDs
as permanent. There is no metadata-cache table to invalidate.

## Current YouTube dependencies

Every yt-dlp invocation ignores user configuration and plugin directories, disables
the cache, and enables `--js-runtimes node:<the current Node executable>`.
Node 24 meets the current minimum Node 22 requirement. Official standalone builds
include EJS solver components; pip users should install `yt-dlp[default]`. The
application does not silently download new challenge-solver code or add auth
workarounds. Site changes, bot challenges, and unavailable media can still prevent
extraction. Update yt-dlp using official instructions.

Sources: [yt-dlp options](https://github.com/yt-dlp/yt-dlp),
[official EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

## Audio

Available output formats are capability-gated by the installed FFmpeg encoders:

| Output | Encoder | Settings |
|---|---|---|
| MP3 | `libmp3lame` | 64, 96, 128, 160, 192 (default), 256, 320 kbps; Auto |
| M4A / AAC | `aac` | Same supported output bitrate choices; Auto |
| Opus | `libopus` | Same supported output bitrate choices; Auto |
| FLAC | `flac` | No bitrate selector |
| WAV | `pcm_s16le` | No bitrate selector |

For explicit lossy bitrates, FFmpeg actually encodes with `-b:a <bitrate>k`.
This avoids yt-dlp's extraction optimization accidentally copying a source when
the user selected a new bitrate. Auto prefers a compatible native source and
copies it with `-c:a copy`; otherwise FFmpeg encodes (MP3 uses VBR quality 2).
Source selection still favors the best source audio; 320 kbps output does not
improve an already lossy source. FLAC/WAV do not restore lost information.

Embedding title, uploader, and source is optional. Thumbnail embedding is opt-in
for MP3/M4A/FLAC and may need JPEG/image support in the FFmpeg build. Turn it off if
the installed toolchain cannot embed a cover. ADTS AAC and WAV metadata support
depends on their containers; a basic download never requires cover embedding.

## Video

MP4 uses compatible H.264/HEVC/AV1-family sources and AAC/MP3 audio. WebM uses
VP8/VP9/AV1 and Opus/Vorbis. MKV supports the broader source-codec combination.
The planner derives resolutions from actual stream heights. It never hardcodes
YouTube format IDs. Normal video selection requires an audio stream and merges
one when the video-only source needs a companion. If a compatible pair does not
exist, choose another container; the app does not silently transcode video.

Advanced exact selection chooses one source format. A video-only exact selection
may be silent, and the UI states this. Output container/encoding settings still
apply; it is a research source selector, not an arbitrary format expression.

## Execution, progress, output

Each UUID job gets an isolated temporary directory. yt-dlp writes a fixed source
template there, prints JSON progress with `--progress-template`, and prints the
final path with `--print after_move`. Structured postprocess templates report
merging. Percent/speed/ETA come only from tool data, and totals can be unknown.
Separate stream progress is per current stream, not a fabricated whole-job percent.
FFmpeg processing stages have names without invented conversion percentages.

FFmpeg copies/remuxes video and native Auto audio; other audio is encoded once.
ffprobe verifies required audio/video streams before publication. Renaming uses
exclusive file creation and handles concurrent same-title downloads. Skip/overwrite
are explicit preferences; rename is default. Names remove cross-platform reserved
characters/device names and traversal. Skip keeps the existing file at publication;
the source may already have been downloaded/processed before that collision check.
Temporary files are cleaned on success,
failure, and cancellation. Restart cleanup only targets known interrupted UUIDs.

Cancellation/timeout kills the owned process tree and waits for process closure.
The API only requests cancellation; the worker confirms the terminal state after
cleanup. No stack traces or raw credential-bearing tool output are returned to UI.

Reference: [FFmpeg command and stream-copy documentation](https://ffmpeg.org/ffmpeg.html).
