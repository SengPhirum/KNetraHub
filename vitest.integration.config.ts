import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Integration tests for KNetraHub PAM. These exercise the real server modules
// (migrations, runner control plane, vault) against a DISPOSABLE PostgreSQL and
// therefore FAIL LOUDLY if no database is reachable — they never silently skip.
// Run: `pnpm test:it:pam` (see scripts/pam-it.mjs to start a throwaway PG).
// Files are named *.it.ts so the DB-free unit suite (vitest.config.ts, which
// matches *.test.ts) never picks them up.
export default defineConfig({
  resolve: {
    alias: {
      '~~': resolve(__dirname, '.'),
      '@@': resolve(__dirname, '.'),
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'app')
    }
  },
  test: {
    include: ['test/pam/integration/**/*.it.ts'],
    environment: 'node',
    globals: false,
    setupFiles: ['./test/pam/integration/setup.ts'],
    hookTimeout: 120000,
    testTimeout: 60000,
    fileParallelism: false
  }
})
