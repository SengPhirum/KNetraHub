import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Unit-test config for KNetraHub PAM. Tests live under test/ and exercise the
// pure/deterministic PAM modules (crypto vault, password policy, policy
// evaluators, audit hash chain). The `~~`/`~` aliases mirror Nuxt so the layer
// modules resolve the same way they do in the app.
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
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false
  }
})
