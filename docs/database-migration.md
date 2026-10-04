# Local SQLite → Turso

The same Drizzle schema, migrations, repository functions and `@libsql/client`
are used in both modes. No dual database implementation exists.

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Default database: `data/app.db`, URL `file:./data/app.db`. The script loads
`.env.local` before `.env` while existing shell variables take precedence.

```powershell
npm run db:generate   # after an intentional src/db/schema.ts change
npm run db:migrate    # apply committed versioned migrations
npm run db:studio     # optional local inspection
```

Do not use `drizzle-kit push` or manually edit deployed tables. Review/commit SQL
and `drizzle/meta` together. Both initial creation and migration #1 → #2 preserve
existing application rows in the automated suite.

## Backup first

Stop the local application/worker before migration to freeze the application's
state. A backup does not cancel or finish an active job for you.

```powershell
npm run db:backup
npm run db:export
```

The backup performs parameterized SQLite `VACUUM INTO`, not a blind copy of a
possibly WAL-backed live file. It writes a timestamped `backups/*.db` and verifies
`PRAGMA integrity_check`. It includes the schema, data and migration journal.
Keep an independent copy outside the checkout. JSON exports use one transaction
and include preferences, job/history data and searches; they exclude local file
paths/execution IDs and binary media. Files in `downloads/` need their own backup.

## Scenario A: new empty Turso database

Install the official [Turso CLI](https://docs.turso.tech/cli/installation).
On Windows, use WSL where required by the official installer. Log in locally;
never paste tokens into a chat or commit them.

```bash
turso auth login
turso db create media-research-test --wait
turso db show media-research-test --url
turso db tokens create media-research-test
```

Privately put the URL/token in `.env.local`:

```dotenv
DATABASE_URL=libsql://your-database.turso.io
DATABASE_AUTH_TOKEN=your-private-token
```

Then run the same commands (from the project, using Node 24):

```powershell
npm run db:migrate
npm run diagnostics
```

No local-file assumptions are used by this connection. Using Turso locally does
not automatically disable your local worker; cloud detection does that on Vercel.
Keep one worker/checkout per execution identity and do not share this queue as a
distributed processor.

## Scenario B: preserve local SQLite data

1. Keep the local database configuration and stop the app/worker.
2. Run `npm run db:backup` and keep the printed snapshot path. Never migrate the
   sole original copy. The app's migrations/journal are included in the snapshot.
3. Create a **new** Turso database from that snapshot (not an existing destination):

```bash
turso db create media-research-imported --from-file ./backups/media-research-TIMESTAMP.db --wait
turso db show media-research-imported --url
turso db tokens create media-research-imported
```

For WSL, the project lives under `/mnt/d/Claude Activities/...`; quote the path
containing spaces. Turso currently documents direct SQLite-compatible file import
through `--from-file`, with a 2 GB file limit. Use the consistent snapshot, not an
uncheckpointed file accompanied by WAL/SHM files.

4. Privately switch DATABASE_URL/TOKEN to the new remote database.
5. Run `npm run db:migrate` to apply only migrations newer than the imported journal.
6. Run `npm run diagnostics`, `npm run db:export`, and compare table counts, job IDs,
   titles, settings and search records with the pre-migration export. Test a settings
   write/read and verify the remote schema. Keep the local snapshot until verified.

Direct import preserves migration state and rows. It does not upload media files.
Vercel will display local history but cannot access a Windows file path or serve
those files. Reverting to the local configuration does not require destructive
database operations.

Official workflow: [Turso db create](https://docs.turso.tech/cli/db/create).

## Portable JSON import alternative

Use this when transferring application rows rather than the entire SQLite file.
Apply migrations to a new empty destination first:

```powershell
npm run db:import -- --input backups/export-TIMESTAMP.json --confirm-import
```

The command validates version, fields, IDs, sources, preferences, statuses, limits
and record counts. It takes a pre-import local snapshot or remote JSON export,
then imports in a transaction only if all application tables are empty. It never
overwrites/merges existing testing or production data. Local-file access keys are
cleared; in-flight jobs become failed history entries instead of restarting
unexpectedly. This JSON route does not carry Drizzle's migration journal: migrate
the destination first. Media files are never imported.

## Turso backups and recovery

`npm run db:backup` deliberately refuses remote mode. For a remote database:

```bash
turso db export media-research-test --output-file backups/turso-snapshot.db
```

The official CLI documentation warns that an exported generation snapshot can
lag recent changes. Do not rely on that file alone for the latest rows; also make
the transactional application JSON export and verify its counts before migrating.
Use the documented SDK synchronization workflow if you need a fully current
cloud SQLite replica. Store exports securely and separately.
Turso also documents creating a new database from another database at a timestamp
with `--from-db` / `--timestamp`; point-in-time retention/features depend on the
current plan. Do not assume paid or fixed retention is included in the free tier.
Never treat a copy of a nonexistent cloud SQLite file as a backup.

References: [db export](https://docs.turso.tech/cli/db/export),
[point-in-time recovery](https://docs.turso.tech/features/point-in-time-recovery),
[Drizzle libSQL setup](https://orm.drizzle.team/docs/get-started/turso-new).

## Verification boundary

Local migration creation, migration upgrades/data preservation, idempotence,
SQLite snapshot integrity, and JSON validation/import refusal were tested here.
No Turso account/credentials were provided. Direct Turso file import, remote
migrations, schema parity, token authentication, and Vercel connectivity are
documented from official sources but **not live-tested in this session**.
