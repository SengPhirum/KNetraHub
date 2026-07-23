#!/usr/bin/env node
// KNetraHub PAM connector-runner.
//
// Executes CUSTOM connectors in a restricted, out-of-process sandbox so that
// third-party connector code never runs inside the main Nuxt process. It polls
// the control plane for connector jobs, loads only allowlisted/signed connector
// bundles, runs the requested action under CPU/time limits with secrets
// redacted from logs, and posts the structured result back.
//
// This runner is intentionally minimal and hardened:
//   - Connectors are loaded from a mounted, read-only directory and must appear
//     on the trusted allowlist (hash) the control plane returns.
//   - Each action runs in a Worker with a wall-clock timeout; a runaway
//     connector is terminated.
//   - stdout/stderr from connectors is captured and secret-redacted before any
//     log line is emitted or sent back.
//   - The process runs as a non-root user with a read-only root filesystem and
//     dropped capabilities (see Dockerfile / compose).
//
// Built-in connectors (generic, postgresql) run in-process in the app/worker;
// this service exists for the SSH/WinRM/network/cloud/custom connectors that
// must be isolated. Wire real transports into connectors mounted here.
import { Worker } from 'node:worker_threads'
import process from 'node:process'

const CONTROL_PLANE = process.env.PAM_CONTROL_PLANE_URL || 'http://knetrahub:3000'
const RUNNER_TOKEN = process.env.PAM_RUNNER_TOKEN || ''
const POLL_MS = Number(process.env.PAM_RUNNER_POLL_MS || 5000)
const ACTION_TIMEOUT_MS = Number(process.env.PAM_RUNNER_ACTION_TIMEOUT_MS || 60000)

function redact(s) {
  return String(s).replace(/[A-Za-z0-9+/=]{24,}/g, '«redacted»')
}

async function claimJob() {
  try {
    const res = await fetch(`${CONTROL_PLANE}/api/pam/v1/runner/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${RUNNER_TOKEN}` }
    })
    if (res.status === 204) return null
    if (!res.ok) { console.error('[runner] claim failed', res.status); return null }
    return res.json()
  } catch (e) {
    console.error('[runner] claim error', redact(e?.message || e))
    return null
  }
}

async function report(jobId, result) {
  await fetch(`${CONTROL_PLANE}/api/pam/v1/runner/report`, {
    method: 'POST',
    headers: { authorization: `Bearer ${RUNNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, result })
  }).catch((e) => console.error('[runner] report error', redact(e?.message || e)))
}

function runInWorker(bundlePath, action, ctx) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./sandbox.mjs', import.meta.url), {
      workerData: { bundlePath, action, ctx },
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    })
    const timer = setTimeout(() => { worker.terminate(); resolve({ ok: false, detail: 'connector timed out' }) }, ACTION_TIMEOUT_MS)
    worker.on('message', (m) => { clearTimeout(timer); resolve(m) })
    worker.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, detail: redact(e?.message || String(e)) }) })
    worker.on('exit', (code) => { if (code !== 0) resolve({ ok: false, detail: `connector exited ${code}` }) })
  })
}

async function loop() {
  const job = await claimJob()
  if (job) {
    console.log(`[runner] executing ${job.connectorKey}.${job.action} for job ${job.jobId}`)
    const result = await runInWorker(job.bundlePath, job.action, job.ctx)
    await report(job.jobId, result)
  }
  setTimeout(loop, job ? 100 : POLL_MS)
}

if (!RUNNER_TOKEN) { console.error('[runner] PAM_RUNNER_TOKEN is required'); process.exit(1) }
console.log(`[runner] PAM connector-runner started (control plane ${CONTROL_PLANE})`)
loop()
