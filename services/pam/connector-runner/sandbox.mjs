// Sandbox worker: loads a single connector bundle and runs one action, then
// posts the structured result back to the runner. Runs in a worker thread with
// a memory cap and a wall-clock timeout enforced by the parent. Connector
// stdout is not forwarded; only the structured {ok, detail} result is returned.
import { workerData, parentPort } from 'node:worker_threads'

async function run() {
  const { bundlePath, action, ctx } = workerData
  try {
    const mod = await import(bundlePath)
    const connector = mod.default || mod.connector
    if (!connector || typeof connector[action] !== 'function') {
      return { ok: false, detail: `connector does not implement "${action}"` }
    }
    // Provide a no-op secret-safe logger to the connector.
    const safeCtx = { ...ctx, log: () => {} }
    const result = await connector[action](safeCtx)
    return result && typeof result === 'object' ? result : { ok: false, detail: 'connector returned no result' }
  } catch (e) {
    return { ok: false, detail: String(e?.message || e).slice(0, 500) }
  }
}

run().then((r) => parentPort?.postMessage(r))
