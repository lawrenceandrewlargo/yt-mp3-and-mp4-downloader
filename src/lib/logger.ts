export function log(level: 'debug' | 'info' | 'warn' | 'error', event: string, detail: Record<string, unknown> = {}) {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  // Callers pass operation IDs/codes, never environments, URLs, tokens or raw tool output.
  console[level](JSON.stringify({ time: new Date().toISOString(), level, event, ...detail }));
}
