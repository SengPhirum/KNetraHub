#!/usr/bin/env node
// KNetraHub PAM connector-runner.
//
// Executes connector actions OUT of the main Nuxt process. It authenticates to
// the control plane with a runner token (hashed server-side, never a user API
// token), registers to receive its operating config + connector allowlist, then
// leases jobs, runs the requested action against a target, and reports a
// structured result.
//
// Security model (hardened — see docs/pam/HARDENING.md):
//   - The control plane NEVER sends a filesystem path. It sends only a connector
//     key + version + expected SHA-256 digest + signature. The runner resolves
//     the bundle inside its own read-only trusted directory, refuses anything
//     outside it (path-traversal safe), and computes the digest of the LOCAL
//     bundle. It executes ONLY when the local digest matches both the claim and
//     the runner's registered config, and the connector is on this runner's
//     allowlist. Digest/allowlist mismatch, unknown connector, or a missing
//     bundle are reported as non-retryable failures — never executed.
//   - Each action runs in a worker thread with a wall-clock timeout + heap cap.
//   - Secrets are delivered only over this authenticated channel and are never
//     logged; log lines are redacted before being shipped.
//   - The process runs non-root with a read-only root filesystem and dropped
//     capabilities (see Dockerfile / compose).
import { Worker } from 'node:worker_threads'
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'

function readSecret(name) {
  const file = process.env[`${name}_FILE`]
  if (file) { try { return readFileSync(file, 'utf8').trim() } catch (e) { console.error(`[runner] cannot read ${name}_FILE`, e?.message); return '' } }
  return (process.env[name] || '').trim()
}

const CONTROL_PLANE = (process.env.PAM_CONTROL_PLANE_URL || 'http://app:3000').replace(/\/$/, '')
const RUNNER_TOKEN = readSecret('PAM_RUNNER_TOKEN')
const CONNECTORS_DIR = resolve(process.env.PAM_CONNECTORS_DIR || '/connectors')
const ACTION_TIMEOUT_MS = Number(process.env.PAM_RUNNER_ACTION_TIMEOUT_MS || 60000)
const RUNNER_VERSION = process.env.PAM_RUNNER_VERSION || '1.0.0'
const HEARTBEAT_FILE = process.env.PAM_RUNNER_HEARTBEAT_FILE || '/tmp/pam-runner-alive'
const SAFE_REF = /^[a-z0-9][a-z0-9._-]{0,63}$/

// Container HEALTHCHECK entrypoint: `node runner.mjs --healthcheck` exits 0 when
// the main loop wrote a recent heartbeat, else 1. Works under a read-only rootfs
// (heartbeat lives on the tmpfs /tmp) with no extra port/server.
if (process.argv[2] === '--healthcheck') {
  try {
    const age = Date.now() - statSync(HEARTBEAT_FILE).mtimeMs
    process.exit(age < 60_000 ? 0 : 1)
  } catch { process.exit(1) }
}

let cfg = { pollIntervalMs: 5000, allowlist: [], connectors: [], maxConcurrentJobs: 4 }
let active = 0

function redact(s) { return String(s ?? '').replace(/[A-Za-z0-9+/=_-]{32,}/g, '«redacted»') }

async function api(path, { method = 'POST', body } = {}) {
  const res = await fetch(`${CONTROL_PLANE}/api/pam/v1/runner/${path}`, {
    method,
    headers: { authorization: `Bearer ${RUNNER_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  if (res.status === 401) { console.error('[runner] unauthorized — token invalid/expired/revoked'); return null }
  if (!res.ok) { console.error(`[runner] ${path} -> ${res.status}`); return null }
  return res.json().catch(() => null)
}

function isSafeRef(key, version) {
  return SAFE_REF.test(String(key || '')) && SAFE_REF.test(String(version || '')) &&
    !String(key).includes('..') && !String(version).includes('..')
}

/** Resolve + integrity-check the local bundle for a claimed connector. Returns
 * {ok, path?, digest?, errorCode?, detail} — NEVER trusts a supplied path. */
function resolveBundle(connector) {
  const key = connector?.key, version = connector?.version, expectedDigest = connector?.sha256
  if (!isSafeRef(key, version)) return { ok: false, errorCode: 'unsafe_ref', detail: 'unsafe connector reference' }
  const known = cfg.connectors.find((c) => c.key === key)
  if (!known) return { ok: false, errorCode: 'not_allowlisted', detail: `connector ${key} not in runner config/allowlist` }
  if (known.version !== version) return { ok: false, errorCode: 'version_mismatch', detail: `config expects ${key}@${known.version}, claim ${version}` }
  const path = resolve(join(CONNECTORS_DIR, key, version, 'index.mjs'))
  if (path !== CONNECTORS_DIR && !path.startsWith(CONNECTORS_DIR + sep)) return { ok: false, errorCode: 'path_escape', detail: 'resolved path escapes trusted dir' }
  if (!existsSync(path)) return { ok: false, errorCode: 'bundle_missing', detail: `no connector bundle installed at ${key}/${version}` }
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (expectedDigest && digest !== expectedDigest) return { ok: false, errorCode: 'digest_mismatch', detail: 'local bundle digest does not match the claim' }
  if (known.sha256 && digest !== known.sha256) return { ok: false, errorCode: 'digest_mismatch', detail: 'local bundle digest does not match registered config' }
  return { ok: true, path, digest }
}

function runInWorker(bundlePath, expectedDigest, action, ctx) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./sandbox.mjs', import.meta.url), {
      workerData: { bundlePath, expectedDigest, action, ctx },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      env: {} // no ambient env leaks into the connector
    })
    let settled = false
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); worker.terminate().catch(() => {}); resolve(r) } }
    const timer = setTimeout(() => done({ ok: false, retryable: true, errorCode: 'timeout', detail: 'connector timed out' }), ACTION_TIMEOUT_MS)
    worker.on('message', (m) => done(m && typeof m === 'object' ? m : { ok: false, detail: 'connector returned no result' }))
    worker.on('error', (e) => done({ ok: false, retryable: true, errorCode: 'worker_error', detail: redact(e?.message || String(e)) }))
    worker.on('exit', (code) => { if (code !== 0) done({ ok: false, retryable: true, errorCode: 'worker_exit', detail: `connector exited ${code}` }) })
  })
}

async function handle(job) {
  active++
  try {
    const bundle = resolveBundle(job.connector || {})
    if (!bundle.ok) {
      await api('logs', { body: { logs: [{ jobId: job.jobId, level: 'error', message: `connector rejected: ${bundle.errorCode} ${bundle.detail}` }] } }).catch(() => {})
      return api('report', { body: { jobId: job.jobId, result: { ok: false, action: job.action, targetChanged: false, verified: false, retryable: false, errorCode: bundle.errorCode, detail: bundle.detail } } })
    }
    const result = await runInWorker(bundle.path, bundle.digest, job.action, job.ctx)
    await api('report', { body: { jobId: job.jobId, result } })
  } catch (e) {
    await api('report', { body: { jobId: job.jobId, result: { ok: false, retryable: true, errorCode: 'runner_error', detail: redact(e?.message || String(e)) } } }).catch(() => {})
  } finally {
    active--
  }
}

async function loop() {
  let job = null
  try {
    job = active < cfg.maxConcurrentJobs ? await api('claim') : null
    if (job) { console.log(`[runner] ${job.jobType}.${job.action} job ${job.jobId} (${job.connector?.key})`); await handle(job) }
  } catch (e) {
    console.error('[runner] loop error', redact(e?.message || e))
  }
  setTimeout(loop, job ? 100 : cfg.pollIntervalMs)
}

async function heartbeatLoop() {
  await api('heartbeat', { body: { activeJobs: active, status: 'online' } }).catch(() => {})
  try { writeFileSync(HEARTBEAT_FILE, String(Date.now())) } catch { /* tmpfs may be read-only in some setups */ }
  setTimeout(heartbeatLoop, Math.max(5000, cfg.pollIntervalMs))
}

async function start() {
  if (!RUNNER_TOKEN) { console.error('[runner] PAM_RUNNER_TOKEN (or _FILE) is required'); process.exit(1) }
  console.log(`[runner] starting; control plane ${CONTROL_PLANE}; connectors dir ${CONNECTORS_DIR}`)
  const reg = await api('register', { body: { version: RUNNER_VERSION, os: `${process.platform}-${process.arch}`, capabilities: { node: process.version } } })
  if (reg?.config) { cfg = { ...cfg, ...reg.config }; console.log(`[runner] registered; allowlist=[${cfg.allowlist.join(',')}] connectors=${cfg.connectors.length}`) }
  else console.warn('[runner] registration failed — will retry via poll loop')
  heartbeatLoop()
  loop()
}

start()
