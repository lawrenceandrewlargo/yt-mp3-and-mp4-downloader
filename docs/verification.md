# Implementation and verification report

Session date: 2026-10-04. Built from scratch in this checkout; no previous
implementation was reused. The implementation is present, but full live media
and cloud acceptance remains outstanding because of the environment restrictions
below. A mocked extractor or passing build is not proof of a live download.

## Technical report

| # | Requested topic | Result |
|---|---|---|
| 1 | Architecture | Next App Router UI/API → services/repositories → Drizzle/libSQL; media services → execution provider; separate single-host Node worker owns downloads. |
| 2 | Versions | Next 16.3.8, React 19.3.0, TypeScript 5.9.3, Drizzle ORM 0.45.2, Kit 0.31.11, @libsql/client 0.18.0, Vitest 4.1.11. Lockfile included. |
| 3 | Node | Actual runtime v24.13.0; package.json requires 24.x. Application/backend are Node/TypeScript. |
| 4 | Database | One lazy Drizzle/@libsql/client connection abstraction, selected by DATABASE_URL/TOKEN. No separate Turso repository implementation. |
| 5 | Local database | `data/app.db`, default `file:./data/app.db`; created and migrated successfully. |
| 6 | Drizzle | Two SQL migrations and journal/snapshots included as source files: 0000_initial and 0001_queue_indexes. Fresh creation, upgrade, idempotence and preserved data tested. Git commits themselves were blocked. |
| 7 | Turso | Connection/configuration implemented and validated; actual credentials, remote connectivity, migrations and schema parity not tested. |
| 8 | Preserve local data | Integrity-checked VACUUM INTO snapshot → new Turso database `--from-file`; validated JSON export/import alternative refuses nonempty destinations. Official remote import workflow documented, not executed. |
| 9 | yt-dlp | Safe argument-array provider, JSON metadata, ytsearch15, Node EJS selection, no external configs/plugins/remote components; extractor output and download orchestration unit-tested. Installed standalone could not start here; live extraction unverified. |
| 10 | FFmpeg | Actual encoder/muxer discovery, explicit conversion/remux arguments, optional cover/title metadata, ffprobe stream verification. 14 direct CLI fixture cases passed; Node-driven real integration blocked. |
| 11 | Search | yt-dlp `ytsearch15:` returns up to 15 choices, followed by separate analysis; recent searches/clear action. Service tested with controlled output; actual YouTube search not verified. |
| 12 | Audio | MP3, M4A, AAC, Opus, FLAC, WAV implemented, capability-gated by installed encoders. All six exercised directly in FFmpeg fixtures. |
| 13 | MP3 quality | 64/96/128/160/192/256/320 kbps plus Auto, default 192. Actual 128/192/320 FFmpeg output bitrates verified. Source-quality limitation explained. |
| 14 | Video | MP4, MKV, WebM implemented; codec-compatible selection/merge/remux. All three containers exercised directly. No video transcoding in the download pipeline. |
| 15 | Resolutions | Best and actual reported heights only; excludes choices lacking compatible audio. 720p/1080p planning tested and fixture outputs verified. Live 1440p/2160p availability not tested. |
| 16 | Queue | SQL jobs, one PID-locked worker, execution identity, concurrency 2 by default (1–4), progress callbacks, cancel requests, owned-process-tree termination, interruption recovery, retry/new ID. No queue lives inside a route invocation. |
| 17 | Tables | preferences, download_jobs (queue and history together), search_history; Drizzle __drizzle_migrations journal. No blobs or duplicated history table. |
| 18 | Automated tests | Five suites cover configuration/URLs/filenames, formats/progress/errors, process arguments/secrets/cancellation, pipeline/cleanup/collisions, migrations/backups/imports, API/settings and queue lifecycle. |
| 19 | Results | 80/80 automated tests; lint, strict typecheck, production build, migration/backup/export and production HTTP smoke passed. Browser settings save/reload passed; responsive desktop/820px/360px layouts inspected. |
| 20 | Security | Reviewed process arguments, input/request bounds, allowlisted HTTPS sources, same-origin checks, path containment/realpaths, exclusive publication, UUID workspace ownership, secret filtering, cloud guards and imports. Regression tests cover these boundaries. No independent penetration test. |
| 21 | Deployment | Not deployed: Vercel CLI and credentials unavailable; Turso credentials unavailable; restricted network. No remote acceptance claimed. |
| 22 | Cloud features | UI/API/settings/history/SQL reads-writes/configuration designed for Turso and Vercel. Optional short search/metadata/format inspection with an official bundled Linux yt-dlp binary; implemented but not cloud-tested. Without that binary, useful capability errors remain. |
| 23 | Local-only | Download worker, FFmpeg processing, cancellation of local processes and file serving. Invocation/storage/body/concurrency constraints do not constitute a demonstrated reliable free cloud downloader. |
| 24 | Limitations | No live yt-dlp proof, no live Turso/Vercel proof, no batch playlist queue, no native Open Folder, no durable cloud media storage. Local metadata calls bounded to 2 per process, not a distributed rate limiter. |
| 25 | Setup | Exact Node 24 local setup commands below and in README. Tools must actually run in the user's terminal. |
| 26 | Run | `npm run dev`; production locally `npm run build` then `npm run start`. Launcher starts Next and the worker, binding loopback. |
| 27 | Turso steps | Exact empty and preserved-data procedures in database-migration.md and quick sequence below. |
| 28 | Vercel steps | Install CLI, link, privately configure Turso/provider env, Node 24, deploy; optional packaged metadata binary and real acceptance checklist in vercel-deployment.md. |
| 29 | Handoff | Root `AI_HANDOFF.md` describes decisions, entry points, commands, safety rules and outstanding checks. |

## Checks actually executed

| Check | Evidence / boundary |
|---|---|
| npm test | 5 files, 80 passed, no skipped tests in the final run. Native SQLite tests share one worker with application modules reset per file. |
| npm run lint / typecheck / build | Passed. Next production routes: /, /history, /settings, /diagnostics, dynamic /api/[...path]. |
| Migrations | Real local Drizzle migrator run, both migrations applied; automated fresh/upgrade/idempotence/preserved-row checks. |
| Backup/export | Real timestamped SQLite snapshot, PRAGMA integrity_check=ok; transactional JSON export written. Import validity/nonempty refusal tested against local SQL. |
| Production HTTP | Four pages, settings/jobs/diagnostics reads and rejected invalid settings write. Production server started with the Next CLI directly because child spawning in the normal launcher is blocked here. |
| Browser | Settings 128 kbps saved, persisted after reload, then default restored to 192. Desktop layout and 820px/360px layouts checked; no measured horizontal overflow on tested settings/workbench views. Diagnostics displayed safe process-blocked explanations. |
| FFmpeg | 14 generated two-second fixtures; ffprobe verified audio streams, requested MP3 bitrates, 720p MP4 merge, 1080p MKV remux, 720p WebM/Opus, and MP3/M4A/FLAC cover/title metadata. Fixture files removed. |
| Worker | Real SQL polling and missing-tool failure handling; queued cancellation tested with the running worker. Active-process cancellation and concurrency under actual downloading are not proven here. |
| Dependencies | Installed from existing official npm tarball cache because network installation was blocked. Full fresh network npm install/ci was not performed. |
| Git | Repository published to `main` through the connected GitHub app in a follow-up on 2026-10-04. Implementation commit: `3925ed6ade83e413ebcec3b7f37cde98cd8eab40`. Local add/commit remains blocked by read-only .git; terminal network access is blocked. Local metadata remains unborn; use a fresh clone or synchronize when permissions/network allow. Secrets/downloads/databases/cache files were excluded. |

## Required live-media matrix

| Requested case | Session result |
|---|---|
| Search, result selection, YouTube URL, audio/video metadata | Implemented and controlled-output tests pass; live yt-dlp unavailable. |
| MP3 128/192/320, M4A/Opus | Actual FFmpeg fixtures pass; end-to-end yt-dlp downloads not tested. |
| 720p/1080p video with audio | Actual FFmpeg merge/remux/stream checks pass; actual extractor downloads not tested. |
| Cancel active download | Owned-tree command and cleanup tests pass with fake processes; queued worker cancellation tested; real active media tree remains unverified. |
| Retry failure | Fresh-ID/settings-snapshot API test passes; actual failed-network retry not tested. |
| Filename collisions | Concurrent exclusive publication, rename/skip/explicit overwrite tested against real files. |
| Playlist detection | URL detection/current-only handling/extractor playlist refusal tested; real playlist enumeration not tested. |
| Invalid URL | Real API validation and automated private/unsafe URL tests pass. |
| Removed/restricted/region/network/conversion errors | Error classification tests; actual external-source failures not reproduced. |
| Missing FFmpeg/yt-dlp | Helpful missing-executable process tests and safe diagnostics. The current live host blocks launching tools rather than providing a working executable environment. |
| Turso and Vercel matrix | No remote tests; credentials/provisioning/deployment required. |

Node `child_process.spawn` and `spawnSync` fail with EPERM in this Codex sandbox,
including spawning Node itself. The installed yt-dlp.exe also fails to unpack its
PyInstaller runtime when launched directly. FFmpeg/ffprobe work when launched
directly by PowerShell. These observations explain the different integration
results; the application does not bypass host restrictions.

Actual FFmpeg/ffprobe build: `2026-05-06-git-f2e5eff3ff-essentials_build-www.gyan.dev`.
The installed yt-dlp version could not be determined reliably.

## Exact setup and continuation commands

Install official yt-dlp/FFmpeg/ffprobe on PATH first, then:

```powershell
node --version                     # 24.x
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run diagnostics
npm run dev
```

Open http://127.0.0.1:3000. Run verification outside the restricted sandbox:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run test:integration
npm run test:youtube
npm run test:smoke                  # while the app is running
```

The real FFmpeg integration creates its own sources; YouTube integration performs
search/metadata only. Before manual download acceptance, set `TEST_MEDIA_URL` or
select a small source you own/have permission to download.

For a **new empty Turso database** (official CLI on Windows through WSL as needed):

```bash
turso auth login
turso db create media-research-test --wait
turso db show media-research-test --url
turso db tokens create media-research-test
```

Enter URL/token privately in DATABASE_URL/DATABASE_AUTH_TOKEN. Then:

```powershell
npm run db:migrate
npm run diagnostics
```

To preserve local data, stop the app, keep the local configuration, run
`npm run db:backup`, and create a **new** remote database:

```bash
turso db create media-research-imported --from-file ./backups/SNAPSHOT.db --wait
```

Switch URL/token privately, run migrations/diagnostics/export, compare row counts
and schema, and test writes. This uses the [official file-import workflow](https://docs.turso.tech/cli/db/create);
it has not been performed in this session. Read [database-migration.md](database-migration.md)
before transferring data; it covers consistent backups, WSL paths, import limits
and lagging remote-export snapshots.

For Vercel Preview:

```powershell
npm i -g vercel
vercel login
vercel link
vercel env add DATABASE_URL preview
vercel env add DATABASE_AUTH_TOKEN preview
vercel env add MEDIA_EXECUTION_PROVIDER preview
vercel deploy
```

Supply Turso secrets through the CLI prompts and `metadata` for the provider;
choose Node 24. Keep deployment protection enabled. Default cloud download
processing is disabled. Optional search/metadata binary packaging and exact
cloud tests are in [vercel-deployment.md](vercel-deployment.md). The boundary is
based on [current Vercel function limits](https://vercel.com/docs/functions/limitations)
and requires live validation before any cloud reliability claim.
