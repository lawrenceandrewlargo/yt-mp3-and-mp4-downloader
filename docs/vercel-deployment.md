# Vercel + Turso deployment testing

## Decision and current research

The app is deployable as a Node.js 24 Next.js App Router application. Direct
cloud media downloads and FFmpeg conversion are deliberately disabled. This is
an architectural decision, not a claim that Vercel cannot spawn child processes.
The default Node runtime supports Node APIs; binaries must match Linux and be
explicitly bundled. Long work must finish within the function invocation.

Official limits checked on 2026-10-04:

| Concern | Published behavior | Consequence here |
|---|---|---|
| Hobby Fluid duration | 300-second maximum | No long-running media queue in functions |
| Hobby memory/CPU | 2 GB / 1 vCPU | No unbounded concurrent transcoding |
| Function packaging | Ordinary size limits; large-functions support up to 5 GB subject to current eligibility/configuration | Larger packages alone do not solve runtime/storage limits |
| Request/response body | 4.5 MB limit | Do not serve ordinary media files through cloud API responses |
| Node API support | Full Node APIs | Process execution needs packaged compatible binaries and live testing |
| Filesystem | Read-only deployment files; temporary `/tmp` is ephemeral | No SQLite/media persistence in function storage |
| Concurrency | Function instances can serve concurrent requests and scale independently | A local in-memory queue is not a cloud durable queue |
| Streaming | Available on Node, subject to invocation/transfer constraints | Streaming is not a permanent storage/queue replacement |

This combination does not provide a reliably demonstrated free-tier background
downloader with permanent files. The full pipeline stays local; there are no paid
queues, storage/transcoding services, or alternative paid APIs in the project.

Sources: [function limits](https://vercel.com/docs/functions/limitations),
[Node runtime](https://vercel.com/docs/functions/runtimes/node-js),
[Node runtime advanced usage](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration),
[function filesystem guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions),
[streaming](https://vercel.com/docs/functions/streaming-functions).

## Prepare database

Follow [database-migration.md](database-migration.md) for an empty database or
a SQLite snapshot import. Apply migrations explicitly before deployment and test
the connection with `npm run diagnostics`. Do not migrate automatically in every
Vercel function or during concurrent builds.

## Deploy

The Vercel CLI was not installed in this session. Install it for environment and
deployment tools:

```powershell
npm i -g vercel
vercel login
vercel link
```

Vercel Marketplace can connect Turso if desired (`vercel integration add turso`);
do not create a second provider or database if you already provisioned Turso.
Map any generated `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` variables to this app's
documented `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. The application intentionally
uses only one connection-variable contract.

Set these privately for **Preview**, then later Production if you want to test it:

```powershell
vercel env add DATABASE_URL preview
vercel env add DATABASE_AUTH_TOKEN preview
vercel env add MEDIA_EXECUTION_PROVIDER preview
```

Enter the Turso URL/token privately and `metadata` for the provider. `VERCEL=1`
already detects cloud mode, but the provider override documents intent. Keep
Node.js **24.x** in project settings; `package.json` also requires it.

```powershell
vercel deploy
```

Use the default Next.js framework preset and `npm run build`. Do not use the
local `npm run start` worker launcher as a Vercel function entrypoint. Protect the
deployment using Vercel deployment protection; this personal app has no accounts.
No custom Vercel configuration file is needed for the default Next.js deployment.

## Optional short cloud metadata/search experiment

Default cloud metadata capability is false when no binary is present. This keeps
the app/database/history/settings fully usable and shows a clear limitation.
To experiment with a real official binary, run this **in the Vercel build**:

```powershell
npm run cloud:prepare
npm run build
```

Set the build command to `npm run cloud:prepare && npm run build`, and privately set
`CLOUD_YTDLP_PATH=./vendor/yt-dlp_linux`. The preparation script fetches the latest
official standalone Linux asset and checks its SHA-256 against the official
release checksum. Next's tracing explicitly includes that binary. It is ignored
by Git, so running cloud:prepare only on your computer does not upload it in a
Git-based deployment. No arbitrary user-provided executable is downloaded.

The metadata provider allows only skip-download operations/version checks,
limits tool execution to 45 seconds, uses `/tmp` only for transient runtime files,
and uses the Node 24 EJS runtime. The API maximum duration is 60 seconds. There is
no FFmpeg binary, download response, cloud queue, or permanent media storage.
Cloud extractor failures from network/site restrictions are reported cleanly.
This optional binary path is implemented but not verified on a live deployment.
Disable it if experiments fail. Do not label search/metadata reliable before testing.

## Acceptance on the deployment

After credentials/provisioning, actually verify:

1. `/`, `/history`, `/settings`, `/diagnostics` render.
2. Diagnostics report Turso connected and the cloud/metadata provider.
3. Save/read a preference; reload and confirm it persists.
4. Read imported history and clear recent searches if you choose to test a write.
5. With the optional binary, test search, selected-result analysis, a permitted URL,
   format inspection, and a timeout/unavailable-media error.
6. Local file actions remain absent and download enqueue returns a helpful 503.
7. No filesystem database/media writes occur; secrets never reach browser JSON.
8. Export/compare data and schema after migrations.

`npm run test:smoke` can target the deployment through `SMOKE_BASE_URL` when it is
accessible to the runner; it performs reads and one rejected invalid-input write.
For a protected deployment, use Vercel's supported access workflow rather than
disabling protection. Inspect logs with `vercel logs <deployment-url>`.

## Session result

No Vercel or Turso credentials are configured here, and the CLI/network path was
unavailable. No deployment, remote migration, remote write/read, or cloud binary
execution was performed. A passing production build is **not** cloud integration
proof. All outstanding live checks are listed in AI_HANDOFF.md and the final report.
