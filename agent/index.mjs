#!/usr/bin/env node
// knetrahub-agent (formerly knetrahub-agent) dispatcher. Deployed as a
// `deploy: mode: global` swarm service so one task runs on every node.
//
// KNETRAHUB_AGENT_MODE (comma-separated: docker,server,network,asset)
// selects which collector(s) this task runs. Defaults to "docker" alone -
// existing deployments that don't set this var at all keep behaving exactly
// as before (KNETRAHUB_AGENT_MODE is accepted too, as an alias, for the same
// reason). Each collector owns its own report loop/interval/target endpoint;
// this file only decides which collectors to start.
import './fileEnv.mjs' // must stay first - see that file's header comment
import { run as runDocker } from './collectors/docker.mjs'
import { run as runServer } from './collectors/server.mjs'
import { run as runNetwork } from './collectors/network.mjs'
import { run as runAsset } from './collectors/asset.mjs'

const COLLECTORS = { docker: runDocker, server: runServer, network: runNetwork, asset: runAsset }

const modes = (process.env.KNETRAHUB_AGENT_MODE || process.env.KNETRAHUB_AGENT_MODE || 'docker')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

for (const mode of modes) {
  const run = COLLECTORS[mode]
  if (!run) {
    console.error(`[knetrahub-agent] unknown mode "${mode}" - skipping. Known modes: ${Object.keys(COLLECTORS).join(', ')}`)
    continue
  }
  run()
}
