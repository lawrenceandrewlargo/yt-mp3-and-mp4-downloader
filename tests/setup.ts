import { vi } from 'vitest';

// Reuse one native SQLite worker, while resetting application modules per file.
// Each database suite owns a new UUID-named database and closes it explicitly.
// Multiple isolated worker contexts can hang the native libSQL addon on Windows.
vi.resetModules();
vi.restoreAllMocks();
vi.unmock('../src/media/diagnostics');
