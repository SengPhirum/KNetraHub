import type { ModuleDefinition } from './types/module'

/**
 * Compile-time catalog of built-in subsystems. Runtime enablement and database
 * state live in the portal database and are deliberately not encoded here.
 * Adding a future built-in app means adding one catalog row plus its layer and
 * database initializer; the launcher/admin UI remain data-driven.
 */
export const BUILTIN_MODULES: readonly ModuleDefinition[] = [
  {
    key: 'docker',
    name: 'Docker',
    description: 'Docker Swarm management - nodes, services, stacks, tasks, and data resources.',
    routePath: '/docker',
    icon: 'i-lucide-container',
    permission: 'docker.view',
    type: 'local',
    order: 10,
    defaultDatabase: 'knetrahub_docker',
    defaultPoolMax: 20
  },
  {
    key: 'monitoring',
    name: 'Monitoring',
    description: 'Full-stack network monitoring - SNMP discovery, polling, health, alerting, traps, syslog, and topology.',
    routePath: '/monitoring',
    icon: 'i-lucide-activity',
    permission: 'monitoring.view',
    type: 'local',
    order: 20,
    defaultDatabase: 'knetrahub_monitoring',
    defaultPoolMax: 40
  },
  {
    key: 'pam',
    name: 'Privileged Access',
    description: 'Privileged accounts, secured credentials, access requests, isolated sessions, recordings, and secrets.',
    routePath: '/pam',
    icon: 'i-lucide-shield-keyhole',
    permission: 'pam.view',
    type: 'local',
    order: 30,
    defaultDatabase: 'knetrahub_pam',
    defaultPoolMax: 20
  },
  {
    key: 'ipmgt',
    name: 'IP Management',
    description: 'IP address management - subnets, address inventory, assignment, and utilization.',
    routePath: '/ipmgt',
    icon: 'i-lucide-id-card',
    permission: 'ipmgt.view',
    type: 'local',
    order: 40,
    defaultDatabase: 'knetrahub_ipmgt',
    defaultPoolMax: 20
  }
] as const

export const BUILTIN_MODULE_KEYS = BUILTIN_MODULES.map((module) => module.key)

export function getBuiltinModule(key: string): ModuleDefinition | undefined {
  return BUILTIN_MODULES.find((module) => module.key === key)
}

export function isBuiltinModuleKey(key: string): boolean {
  return BUILTIN_MODULE_KEYS.includes(key)
}
