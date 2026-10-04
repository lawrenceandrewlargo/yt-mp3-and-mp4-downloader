# Media Lab — Media Research Downloader

A personal media workbench built from scratch to research yt-dlp, FFmpeg,
metadata, codecs/containers, local queues, SQLite/libSQL, Turso and Vercel.
The application backend is **Node.js 24**, not Python. There are no accounts,
subscriptions, paid search APIs, hosted transcoding services or binary media in SQL.

**Verification status:** the UI, database/migrations, API validation, unit tests,
production build, HTTP smoke and direct FFmpeg fixture tests have been exercised.
Full live yt-dlp downloading/search and a Vercel/Turso deployment could not be
verified in this Codex sandbox. Read [the verification report](docs/verification.md)
for the exact boundary; implemented does not mean live-tested.

## Quick start (Node 24)

```powershell
node --version                    # must be v24.x
npm install
Copy-Item .env.example .env.local  # optional; local defaults work without it
npm run db:migrate
npm run diagnostics
npm run dev
```

Open **http://127.0.0.1:3000**. The development command starts Next.js and the local
worker. Run commands from the project root. No external database is required.

Production locally:

```powershell
npm run build
npm run start
```

For separate terminals, run `npx next dev --hostname 127.0.0.1` and `npm run worker`.
Keep only one worker per checkout. The default bind is loopback because this is
personal software without authentication.

## Install/update media tools

Put **official yt-dlp**, FFmpeg and ffprobe on PATH. On Windows, download the
official [yt-dlp.exe release](https://github.com/yt-dlp/yt-dlp/releases/latest).
[yt-dlp installation instructions](https://github.com/yt-dlp/yt-dlp/wiki/Installation)
also cover Linux/macOS. FFmpeg and ffprobe must be actual binaries, not the Python
package named ffmpeg; use builds linked by [FFmpeg](https://ffmpeg.org/download.html).
Respect the licenses of redistributed binaries.

```powershell
yt-dlp --version
ffmpeg -version
ffprobe -version
yt-dlp -U                         # update the existing official release binary
```

yt-dlp currently recommends nightly for users affected by site changes; its
official `yt-dlp --update-to nightly` command is an opt-in update, not an app
workaround. Pip installation should use `yt-dlp[default]` to include EJS.
Node 24 satisfies the current minimum Node 22 EJS runtime requirement. The app
explicitly selects the running Node executable, ignores external configs/plugins,
and does not fetch remote solver code. See the [official EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

Missing/unstartable tools are explained in Diagnostics. Audio encoding formats
are shown according to the detected FFmpeg encoders. FFmpeg and ffprobe are
required by the local pipeline for processing and output verification.

## Use the workbench

**Paste URL:** paste a supported public HTTPS URL → Analyze → inspect thumbnail,
title/uploader/duration and streams → Audio/Video → choose output → confirm rights
→ Add to download queue. Pasting never downloads automatically.

**Search:** enter a title/topic → search 15 YouTube results using yt-dlp → select
one result → analyze → choose output. No paid YouTube Data API or auto-download of
the first result is used.

Supported URL hosts are deliberately allowlisted: YouTube, Vimeo, Internet Archive,
Wikimedia uploads, W3C media, and Blender downloads. Private network, credentialed,
non-HTTPS, arbitrary port and file URLs are rejected. To support another site,
review and change the server-side allowlist intentionally; it is not an HTTP setting.

**Audio:** MP3, M4A, AAC, Opus, FLAC, WAV where installed encoders exist. MP3 has
64/96/128/160/**192**/256/320 kbps and Best/Auto. Fixed bitrate really re-encodes;
Auto prefers native stream copy. Output bitrate is distinct from source quality:
320 kbps does not improve an inferior source, and FLAC/WAV cannot restore lost
audio. FLAC/WAV hide the bitrate selector.

**Video:** MP4, MKV, WebM where the installed muxers exist. Only source resolutions
compatible with the chosen container are enabled, including 360p–2160p/4K and
other reported heights. No upscaling or hardcoded YouTube format IDs. Compatible
video/audio streams are merged/remuxed without video re-encoding.

**Advanced:** inspect real format IDs, container/extension, resolution, FPS, codecs,
bitrates, size estimates and HDR/SDR information. Exact selection chooses one
source stream; video-only exact formats may be silent.

**Playlists:** recognized URLs display View items, capped at 50 entries. Select
individual entries to analyze/download. A watch URL with a playlist selects the
current video only. There is no automatic/batch whole-playlist download.

**Queue/history:** default concurrency 2 (configurable 1–4), persisted SQL statuses,
actual download progress, cancellation requests, retry failed/cancelled jobs,
safe duplicate names, source copying, metadata reanalysis, history removal and
local file saving. Removing a history record does not remove the downloaded file.
Native Open Folder is deliberately absent; a cloud browser cannot open a local
Windows folder. Conversion progress shows the actual stage without fake percentages.

## Settings and storage

Settings include default audio/video choices, quality/resolution, concurrency,
optional metadata/cover embedding, file naming, and rename/skip/explicit overwrite.
Storage directories/executables are configured by the administrator environment,
not editable through HTTP. Defaults:

```text
data/app.db                  application data only
data/tmp/<job UUID>/         isolated temporary media
downloads/audio/             completed audio
downloads/video/             completed video
backups/                     SQLite snapshots and portable JSON exports
```

Rename automatically is the default. Overwrite is an explicit preference; it can
replace matching files. Stop the app before importing/moving a database or storage.

## Database and backups

One Drizzle + @libsql/client abstraction uses local SQLite or remote Turso via
environment configuration. Tables: preferences, download_jobs (queue + history),
search_history; Drizzle owns its migration journal. No media blobs are stored.

```powershell
npm run db:generate
npm run db:migrate
npm run db:studio
npm run db:backup
npm run db:export
npm run db:import -- --input backups/export-TIMESTAMP.json --confirm-import
```

SQLite backup uses `VACUUM INTO` and integrity verification. JSON import validates
the complete export and refuses a nonempty destination; it never silently
overwrites testing/production data. Back up media files separately.

For Turso, create an empty database and apply the same migrations, or create a
new database from an integrity-checked local snapshot with `turso db create NAME
--from-file SNAPSHOT.db`. The imported migration journal prevents re-creating
existing tables. See [database migration](docs/database-migration.md) for exact
Windows/WSL commands, backup behavior, export caveats and remote recovery.

## Environment variables

All are server-only; no token is exposed through browser JSON.

| Variable | Default / purpose |
|---|---|
| `DATABASE_URL` | `file:./data/app.db`; remote `libsql://...` or `https://...` |
| `DATABASE_AUTH_TOKEN` | Required for remote Turso; empty for local SQLite |
| `MEDIA_EXECUTION_PROVIDER` | `auto`; `local` or `metadata` explicit override; Vercel always disables local processing |
| `DOWNLOAD_DIRECTORY` | `./downloads`; trusted local permanent storage root |
| `TEMP_DIRECTORY` | `./data/tmp`; trusted local temporary root; cloud always uses `/tmp` |
| `DOWNLOAD_CONCURRENCY` | Initial settings default 2; integer 1–4 |
| `MEDIA_TIMEOUT_SECONDS` | Per download/processing operation default 1800; 10–7200 |
| `YTDLP_PATH` | `yt-dlp`; trusted executable name/absolute path |
| `FFMPEG_PATH` | `ffmpeg`; trusted executable name/absolute path |
| `FFPROBE_PATH` | `ffprobe`; trusted executable name/absolute path |
| `CLOUD_YTDLP_PATH` | Optional packaged Linux yt-dlp path; only metadata/search |

`VERCEL=1` is supplied by Vercel; `NODE_ENV` is managed by Next.js. Metadata calls
are capped at 60 seconds locally/45 seconds in cloud; those are independent of
the download timeout. Saved concurrency preferences override their environment
default. `.env.local` takes precedence over `.env`; existing shell env wins.

Test-only optional variables: `SMOKE_BASE_URL`, `TEST_SEARCH_QUERY`, `TEST_MEDIA_URL`.
The network integration script does not download media.

## Vercel + Turso

Install the CLI: `npm i -g vercel`. Create/configure Turso, migrate explicitly, set
DATABASE_URL/TOKEN privately in Vercel Preview, set Node 24, then `vercel deploy`.
The production build does not require a database connection.

Cloud supports UI/database/settings/history/capability APIs by design. Cloud media
downloads, queue execution, local-file actions and FFmpeg processing are disabled.
Search/metadata need an opt-in official packaged Linux yt-dlp binary; without it,
the UI states the limitation. The optional setup command is `npm run cloud:prepare`.
It must run during a Git-based deployment build because `vendor/` is ignored.
See [Vercel deployment](docs/vercel-deployment.md) for exact steps and verification.

Vercel has invocation, memory, body-size and ephemeral-filesystem constraints;
it is not treated as a persistent server. No paid storage/queue is substituted.
Keep this account-free personal deployment protected; do not operate it as a
public downloading API.

## Verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration         # real FFmpeg pipeline, self-generated media
npm run test:youtube             # live yt-dlp search + metadata only
npm run test:smoke               # application must already be running
```

Unit tests mock external tools and cover parsing/planning, secrets/arguments,
cancellation, collisions, databases/migration upgrades, backups/import validation,
settings/API requests and queue lifecycle. Integration tests are separate and
never passed merely because unit tests or the build pass. For direct Windows
tool verification: `powershell -File scripts/verify-ffmpeg.ps1`.

The current sandbox blocks Node child process creation, including tsx's esbuild.
`scripts/run-ts.cjs` offers an in-process verification runner, e.g.
`node scripts/run-ts.cjs scripts/migrate.ts`; it does **not** bypass the media
process restriction. Next is configured to use worker threads and the TypeScript
API, which allowed a real production build here. Normal unrestricted Node 24
development uses the standard npm commands above.

## Troubleshooting

- **Tools missing:** check Diagnostics/PATH, install official binaries, or configure
  trusted executable paths in `.env.local`. Restart after environment changes.
- **Node spawn EPERM:** the host/sandbox is blocking process creation. Run locally
  on unrestricted Node 24; disabling application validation will not fix it.
- **PyInstaller parent-directory error:** the standalone yt-dlp cannot unpack its
  runtime in this host. Test it directly in a normal terminal; check writable temp
  storage and official installation. This session could not start that binary.
- **Worker unavailable:** run `npm run dev` or `npm run worker`; migrate first.
  Another worker's lock must not be removed while that worker is alive.
- **Database unavailable:** verify the URL/token without logging them and run
  migrations. Cloud rejects file databases by design.
- **YouTube extraction fails:** update official yt-dlp/EJS and check network. Private,
  age-limited, regional, removed or bot-challenged media can remain unavailable;
  the app does not bypass those restrictions.
- **No matching format:** reanalyze; switch container (often MKV has broader codec
  support). Format availability can change.
- **Cover embedding fails:** disable thumbnail embedding; basic downloads do not
  require it.
- **File missing:** it may have moved or belongs to another computer. Cloud history
  never promises access to local files.
- **Disk full/timeout/conversion failure:** free space, choose a smaller source, check
  FFmpeg, and retry. No output is published before ffprobe stream verification.

## Documentation / handoff

- [Architecture](docs/architecture.md)
- [Media pipeline](docs/media-pipeline.md)
- [Database migration](docs/database-migration.md)
- [Vercel deployment](docs/vercel-deployment.md)
- [Verification and final report](docs/verification.md)
- [AI_HANDOFF.md](AI_HANDOFF.md) — the next agent's starting point

Download only content you own, have permission to download, or otherwise have the
legal right to download. Source availability does not imply permission. The app
does not implement DRM, paywall, authentication or access-control circumvention.
