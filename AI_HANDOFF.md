# AI handoff: Media Lab

Updated 2026-10-04. Read this, README.md and docs/verification.md before continuing.
This is a new implementation, not a refactor of the user's previous downloader.

## Purpose and scope

Personal research into yt-dlp, FFmpeg, media formats, Node.js, SQLite/libSQL,
Turso and Vercel. Download only owned/permitted/legal content. Application and
backend must remain Node.js 24/TypeScript. No accounts, billing, multitenancy,
paid APIs/queues/storage, DRM, cookies or access-control circumvention.

## Stack and entry points

Actual Node v24.13.0; engines 24.x. Next 16.3.8 App Router, React 19.3.0,
TypeScript 5.9.3, Drizzle ORM 0.45.2/Kit 0.31.11, @libsql/client 0.18.0,
Zod, Vitest 4.1.11. package-lock.json is the dependency source of truth.

```text
src/app/                  pages, global styles, one Node catch-all API route
src/components/           client workbench/history/settings/diagnostics
src/config/env.ts         lazy validated local/cloud configuration
src/types/                browser-safe contracts/options
src/db/                   single libSQL/Drizzle connection and schema
src/repositories/app.ts   settings, jobs/history and recent queries
src/services/api.ts       API dispatch, origin/input bounds, local file streaming
src/services/data-transfer.ts  SQLite snapshots, transactional JSON export/import
src/services/local-identity.ts execution identity for local files/jobs
src/media/metadata.ts     yt-dlp JSON parsing, search, analysis, playlist listing
src/media/formats.ts      actual format planning and structured progress
src/media/diagnostics.ts  tool versions/encoders/muxers, capabilities, DB health
src/media/execution/     pluggable providers and the media process boundary
src/media/download/      orchestration, ffprobe verification, publication
scripts/app.ts            local Next + worker launcher
scripts/worker.ts         PID-locked, SQL-backed single-host processor
drizzle/                  versioned SQL, snapshots and migration journal
tests/                    automated suites; tests/setup.ts resets modules
docs/                     architecture, media, migration, deployment, verification
data/, downloads/, backups/, vendor/   ignored runtime artifacts
```

## Database decisions

One database abstraction chooses `file:./data/app.db` or a token-authenticated
libsql/HTTPS Turso URL. Local parent directory created automatically. Cloud
rejects file databases; no migrations happen implicitly during requests/builds.
Tables: preferences (one validated JSON settings record), download_jobs (queue
and history; per-job request/settings snapshot), search_history (ten recent
queries). Drizzle owns __drizzle_migrations. Media is never stored in SQL.

0000_initial creates tables; 0001_queue_indexes adds lookup indexes. Both SQL
files, meta snapshots and journal must travel together. Generate after intentional
schema edits, review SQL, migrate; do not push/manual-edit deployed tables.

Local backup is VACUUM INTO with integrity checking. JSON exports use a single
transaction and clear local paths/execution identities. Imports validate all rows,
take a backup through the CLI, and refuse any nonempty destination. In-flight
imported jobs become failed history. Whole-file Turso import is a new database
from an integrity-checked snapshot; see docs/database-migration.md. Remote import,
schema parity and token authentication remain untested here.

## Media decisions

MediaExecutionProvider is independent of Next routes. Local provider uses safe
spawn argument arrays; only src/media/execution/process.ts spawns media tools.
Metadata provider permits skip-download/version calls only and refuses FFmpeg.
Trusted tool paths containing a directory resolve before changing job cwd;
bare names use PATH. Pass yt-dlp --ffmpeg-location only for an actual filesystem
path, never the default PATH name `ffmpeg` (official yt-dlp would reject it).

yt-dlp ignores outside configuration/plugins, enables the running Node explicitly
for EJS, disables remote components and geo-header spoofing. Installed official
standalone includes EJS; pip users need yt-dlp[default]. Search uses ytsearch15
flat JSON; selecting a result always runs a separate full analysis. HTTPS source
hosts are intentionally allowlisted. Formats come from actual metadata; DRM and
storyboards are excluded. Unexpected playlist/multi_video metadata is rejected.
Playlist viewing is capped at 50; individual items only, no automatic batch.

MP3/M4A/AAC/Opus/FLAC/WAV capability-gated by real FFmpeg encoders. Fixed output
bitrate means encoding; Auto prefers native streams, including FLAC/PCM. FLAC/WAV
do not restore lossy information. MP4/MKV/WebM video uses compatible stream copy,
merging/remuxing, actual heights and compatible audio. Exact advanced format can
be silent and is labeled accordingly. No video transcoding/upscaling.

Each job owns an exclusively created UUID temp directory. Download stdout uses
JSON progress templates and after_move filepath. Conversion/merge shows stages,
not made-up percent. ffprobe verifies streams before publication. Rename uses
exclusive file creation to handle simultaneous collisions; overwrite is explicit.
Only a job's owned workspace is removed in cleanup. Source metadata and optional
covers supported; thumbnails are off by default.

## Queue and local/cloud separation

One worker per checkout, enforced by PID lock and heartbeat. SQL statuses:
queued/analyzing/downloading/processing/merging/converting/completed/failed/cancelled.
Concurrency defaults 2, configurable 1–4. Jobs snapshot settings on enqueue.
Restart fails interrupted jobs and cleans owned temp paths. Active cancellation
requests abort processes, wait for closure and cleanup, then write cancelled.
Windows taskkill targets the owned PID/tree; Unix uses a process group. Progress
polling drains before terminal updates to prevent late status regression.

Execution identity persists under data/ so local history/file actions belong to
the machine/checkout that produced them. API hides relative local paths; filenames
are distinct from storage paths. Imported history is not a cloud file download.
History deletion leaves media intact. No native Open Folder action.

VERCEL=1 always disables the worker/download/file path, even if provider=local.
metadata override also selects research mode. Cloud requires Turso. Optional
CLOUD_YTDLP_PATH points to a checksum-verified official Linux standalone binary
prepared during the cloud build and explicitly included in Next file tracing.
Cloud metadata processes capped at 45s; API maxDuration 60s; /tmp transient only.
This optional binary has not been deployed/tested. No reliable free cloud media
processor was demonstrated, so none is enabled. No paid substitute infrastructure.

## Commands

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run diagnostics
npm run dev
```

Production local: `npm run build` then `npm run start`; separate worker:
`npm run worker`. App binds 127.0.0.1:3000. Run from repository root.

Checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Integrations: `npm run test:integration` (generated real FFmpeg sources),
`npm run test:youtube` (live yt-dlp search/analysis only), `npm run test:smoke`
(running app). Windows direct-tool fixtures: `powershell -File scripts/verify-ffmpeg.ps1`.

DB: `db:generate`, `db:migrate`, `db:studio`, `db:backup`, `db:export`.
Explicit empty destination import:
`npm run db:import -- --input backups/export-TIMESTAMP.json --confirm-import`.
`npm run cloud:prepare` is opt-in cloud-build binary packaging.

Install Vercel CLI with `npm i -g vercel`; login/link, privately configure Preview
DATABASE_URL, DATABASE_AUTH_TOKEN and metadata provider, select Node 24, deploy.
Migrate Turso explicitly first. Detailed exact commands in docs/vercel-deployment.md.
Keep deployment protection enabled; the app has no authentication by user request.

## Verified feature status

80 tests pass (five suites), lint/typecheck/production build pass. Real local
fresh/upgrade/idempotent migrations preserve data; snapshots pass integrity check;
JSON export and API settings persistence tested. Production HTTP smoke passed.
Browser desktop/tablet 820px/mobile 360px checked; settings save/reload verified,
default restored to 192. Origin checks use incoming HTTP Host, not Next's internal
localhost URL; arbitrary forwarded hosts are not trusted.

14 direct FFmpeg cases passed, including MP3 128/192/320, other audio formats,
720p MP4 merge with audio, 1080p MKV remux, WebM/Opus and three cover/title cases.
Real worker missing-tool failure and queued cancellation tested. Actual extractor
downloads, live progress, active process-tree cancellation, sustained concurrency
and full real pipeline are NOT verified. Mocked process tests do not establish
those features live. Read docs/verification.md for the full acceptance matrix.

## Environment restrictions and outstanding work

Codex sandbox blocks Node child_process spawn/spawnSync with EPERM, including
Node itself. Installed yt-dlp.exe additionally cannot unpack its PyInstaller
runtime when launched directly. FFmpeg/ffprobe run directly from PowerShell.
Thus do not diagnose these as failed codecs or invent a downloader workaround.
Run the integrations and actual permitted small downloads from unrestricted
Node 24 before declaring the local downloader fully accepted.

Dependencies installed from the official existing cache; network install blocked.
scripts/run-ts.cjs is an in-process TS verification helper for migration/diagnostic
scripts when tsx/esbuild cannot spawn. It does not bypass media process restrictions.
One-time cache/migration recovery scripts moved under ignored data/recovery; they
are not required for normal setup and must not regenerate deployed migration history.
Next uses workerThreads, cpus=2, webpackBuildWorker=false and useTypeScriptCli=false
to enable the real build in this host. Vitest reuses one native SQLite worker with
module resets and UUID-isolated DBs; isolated native worker contexts hung here.

No Turso/Vercel credentials or CLI configured. Provision/deploy privately and run
all remote acceptance checks, including writes/reads/schema/import/optional
Linux yt-dlp/EJS/timeouts. Do not claim deployment from a passing build.
Git initialized but add/commit failed: .git is read-only under this task's permission
profile. All source remains uncommitted; create logical commits when permitted.
At handoff, a direct production preview was left running on 127.0.0.1:3000 and
the browser workbench left open. No download worker was left running. Verify
current process/port state before launching a second server; this note can drift.

## Safety rules for continuation

Never concatenate shell commands with user input or accept executable/storage
paths through HTTP. Bound requests (16 KB), process output, timeouts and concurrency.
Never expose/log tokens, env snapshots, cookies, raw extractor stderr or private
absolute paths. Filter secrets out of child environments. Validate source URLs,
strict settings/requests/imports, same-origin writes and rights acknowledgment.
Preserve realpath containment, owned workspace cleanup and exclusive publication.
Never commit .env, data, media, backups, temp outputs or downloaded binaries.
No paid service/authentication/DRM expansion without a new explicit user request.
