#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

const composeFile = 'docker/docker-compose.dev.yml'
const dockerBin = process.platform === 'win32' ? 'docker.exe' : 'docker'
const userArgs = process.argv.slice(2)
// --project-directory anchors the compose file's relative paths (build
// context, ./agent, ./docker/dev/..., .env) to the repo root (cwd) rather
// than to docker/ (where compose would otherwise resolve them by default).
const composeArgs = ['compose', '-f', composeFile, '--project-directory', '.']

if (!existsSync(composeFile)) {
  console.error(`Missing ${composeFile}. Run this command from the project root.`)
  process.exit(1)
}

if (!existsSync('.env')) {
  console.error('Missing .env. Copy .env.example to .env and set your local values first.')
  process.exit(1)
}

if (userArgs.length > 0) {
  composeArgs.push(...userArgs)
} else {
  composeArgs.push('up', '--build')
}

const child = spawn(dockerBin, composeArgs, {
  stdio: 'inherit',
  shell: false
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
