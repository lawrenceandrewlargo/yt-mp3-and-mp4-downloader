# Architecture

Media Lab is a personal, permission-based research downloader. The application and
backend are Node.js 24 and TypeScript. Python is never the application server;
the official yt-dlp standalone executable may embed Python internally.

## Boundaries

```text
Next.js App Router pages / responsive React workbench
    ↓ JSON, polling, local file response
Node route handler → API service (validation, origin checks, capabilities)
    ├── repositories → Drizzle → @libsql/client → SQLite file OR Turso
    └── metadata/search services → MediaExecutionProvider → structured yt-dlp JSON

Local Node worker → persisted download_jobs → format planner → download pipeline
    → LocalMediaExecutionProvider → yt-dlp / FFmpeg / ffprobe
    → job-owned temporary files → verified output → downloads/audio or video
```

The route handler delegates to `src/services/api.ts`; media commands are never
constructed in routes. `src/media/execution/process.ts` is the media process boundary.
Arguments are arrays with `shell: false`. Administrator environment variables are
the only way to configure executable paths. The process environment excludes
database credentials. A future provider implements the same interface without
changing the UI, metadata services, planner, or repository layer.

## Database

`src/db/index.ts` lazily creates exactly one libSQL client/Drizzle abstraction.
`file:./data/app.db` works locally; `libsql://...` plus an auth token uses Turso.
Cloud execution rejects file databases, including an explicit local-provider
override on Vercel. The build does not open a database or require secrets.

Three application tables:

| Table | Purpose |
|---|---|
| `preferences` | One validated settings document; no user/multi-tenant model |
| `download_jobs` | Durable queue and download history in one table |
| `search_history` | Ten recent searches; bounded pruning |

Drizzle owns `__drizzle_migrations`. Download media is never stored in SQL.
Jobs store a filename and relative local storage key, never an absolute Windows
path. A local execution ID prevents another computer or Vercel from presenting
someone else's local files as downloadable.

Migrations are versioned SQL plus Drizzle snapshots/journal. Migration #1 creates
the tables, and #2 adds useful scoped queue/search indexes. Both apply to either
database mode. No automatic build-time migration is performed: deploy after an
explicit migration against the intended database.

## Queue and process lifecycle

`npm run dev` and `npm run start` launch Next.js and a separate Node worker.
The worker is **single-host**, not a distributed queue. A local PID lock prevents
two workers for this checkout. Its heartbeat is required before accepting jobs.
Default concurrency is 2; settings permit 1–4. HTTP never launches download tasks.

Queued work persists across worker restarts. Interrupted active jobs are marked
failed/cancelled rather than falsely completed. The worker polls cancellation,
aborts the current execution, and only then records the final status. Polling
updates are serialized/drained before terminal state to prevent a late progress
write from reviving a completed job. Graceful launcher shutdown uses IPC to let
the worker terminate its children and clean up.

Windows cancellation uses `taskkill /PID <owned PID> /T /F`; Unix uses a dedicated
process group. Metadata operations time out and are limited to two per Node
process; the local worker adds the download concurrency bound. This is not a
global cloud rate limit, and the app is not intended for public operation.

## Local and cloud

Local execution runs all media tools and owns permanent media directories.
Cloud execution supports the UI and database operations, and has an optional
packaged yt-dlp provider **only for short search/metadata operations**. It never
runs FFmpeg, starts a queue, serves local files, or assumes `/tmp` persists.
Search/metadata report unavailable when no cloud binary is configured.

No Redis, hosted queues, paid APIs, object storage, accounts, or orchestration is
required. Local defaults cost nothing. Vercel/Turso testing uses available free
plans, subject to their changing quotas. Keep deployments behind Vercel deployment
protection because the app intentionally has no user authentication.

## UI

The URL/search flows require explicit analysis/result selection. A rights checkbox
is required to enqueue. Audio/video choices and Advanced source inspection are
separate. No automatic first-result download, fabricated progress, or resolution
upscaling occurs. History can copy a source, reanalyze, retry failed jobs, save an
available local file, or remove a record without deleting media. Storage roots are
administrator configuration, not HTTP input.
