// Sandbox worker: runs exactly ONE connector action and returns a structured
// result. The parent (runner.mjs) has already resolved the bundle inside the
// trusted read-only directory and computed its digest; this worker re-verifies
// the digest (defense in depth) before importing, so a bundle swapped between
// verification and execution is still rejected. The connector is imported from
// a verified local path — never from a path supplied by the web app.
import { workerData, parentPort } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

function normalize(action, r) {
  if (!r || typeof r !== 'object') return { ok: false, action, targetChanged: false, verified: false, detail: 'connector returned no structured result' }
  return {
    ok: r.ok === true,
    action: r.action || action,
    targetChanged: r.targetChanged === true,
    verified: r.verified === true,
    retryable: r.retryable === true,
    errorCode: r.errorCode,
    detail: typeof r.detail === 'string' ? r.detail.slice(0, 2000) : undefined,
    evidence: r.evidence && typeof r.evidence === 'object' ? r.evidence : undefined,
    changedObjects: Array.isArray(r.changedObjects) ? r.changedObjects : undefined,
    // discover results — preserved so the control plane can populate the queue
    accounts: Array.isArray(r.accounts) ? r.accounts : undefined
  }
}

async function run() {
  const { bundlePath, expectedDigest, action, ctx } = workerData
  try {
    if (expectedDigest) {
      const digest = createHash('sha256').update(readFileSync(bundlePath)).digest('hex')
      if (digest !== expectedDigest) return { ok: false, retryable: false, errorCode: 'digest_mismatch', detail: 'bundle changed after verification' }
    }
    const mod = await import(pathToFileURL(bundlePath).href)
    const connector = mod.default || mod.connector
    if (!connector || typeof connector[action] !== 'function') {
      return { ok: false, retryable: false, errorCode: 'unsupported_action', detail: `connector does not implement "${action}"` }
    }
    const safeCtx = { ...ctx, log: () => {} } // connector logs are dropped; runner ships its own redacted logs
    return normalize(action, await connector[action](safeCtx))
  } catch (e) {
    return { ok: false, retryable: true, errorCode: 'exception', detail: String(e?.message || e).slice(0, 500) }
  }
}

run().then((r) => parentPort?.postMessage(r)).catch((e) => parentPort?.postMessage({ ok: false, detail: String(e?.message || e) }))
