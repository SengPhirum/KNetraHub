// Resolve *_FILE env vars into their plain sibling, for the one secret this
// agent takes: KNETRAHUB_AGENT_TOKEN. Same Docker/Swarm secrets convention as
// the main app's docker/docker-entrypoint.sh (POSTGRES_PASSWORD /
// POSTGRES_PASSWORD_FILE style) - but this image is distroless (no shell, see
// agent/Dockerfile), so resolution has to happen here in JS instead of a
// shell entrypoint.
//
// This MUST be the first import in index.mjs. ES module imports are
// evaluated in the order they first appear, and every collector reads its
// env vars into a top-level `const` at import time - before index.mjs's own
// body ever runs - so this side effect has to happen before any collector
// module is evaluated, not just before index.mjs's dispatch logic runs.
import { readFileSync } from 'node:fs'

function resolveFileEnv(name) {
  const fileVar = `${name}_FILE`
  const value = process.env[name]
  const filePath = process.env[fileVar]
  if (!filePath) return

  if (value) {
    console.error(`[knetrahub-agent] error: both ${name} and ${fileVar} are set - use only one`)
    process.exit(1)
  }

  try {
    process.env[name] = readFileSync(filePath, 'utf8').trim()
  } catch (err) {
    console.error(`[knetrahub-agent] error: ${fileVar} points to a file that can't be read: ${filePath} (${err.message})`)
    process.exit(1)
  }
  delete process.env[fileVar]
}

resolveFileEnv('KNETRAHUB_AGENT_TOKEN')
