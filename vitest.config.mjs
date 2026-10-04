import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include:['tests/**/*.test.ts'], pool:'threads', maxWorkers:1, isolate:false, fileParallelism:false, setupFiles:['tests/setup.ts'], testTimeout:15000 }, resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}} });
