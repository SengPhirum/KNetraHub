#!/usr/bin/env node
// Compute the SHA-256 digest of every connector bundle and write a signed-input
// manifest. The control plane registers these digests (registerConnectorPackage
// signs them); the runner then loads a bundle ONLY when its local file digest
// matches the registered+signed entry. Run at build/publish time:
//   node scripts/pam-publish-connectors.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', 'services', 'pam', 'connector-runner', 'connectors')
const out = []

for (const key of readdirSync(ROOT)) {
  const keyDir = join(ROOT, key)
  if (!statSync(keyDir).isDirectory()) continue
  for (const version of readdirSync(keyDir)) {
    const bundle = join(keyDir, version, 'index.mjs')
    if (!existsSync(bundle)) continue
    const sha256 = createHash('sha256').update(readFileSync(bundle)).digest('hex')
    out.push({ key, version, sha256, entry: `${key}/${version}/index.mjs` })
    console.log(`${key}@${version}  ${sha256}`)
  }
}

const manifestPath = join(ROOT, 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(out, null, 2) + '\n')
console.log(`\nWrote ${out.length} entries to ${manifestPath}`)
