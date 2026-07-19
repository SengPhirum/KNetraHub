import type { Permission } from '../utils/permissions'

export type ModuleType = 'local'
export type ModuleStatus = 'disabled' | 'initializing' | 'ready' | 'error'
export type ModuleDatabaseMode = 'portal-host' | 'custom-host'

/**
 * Describes one KNetraHub subsystem (Dock, Monitoring, IP Management)
 * for the app launcher and the contextual sidebar. Every module is now served
 * in-process by this app (SPA pages under app/pages + Nitro API routes); the
 * former Module-Federation remote fields are gone. Frontend-only metadata -
 * never a substitute for backend permission checks (each module's API
 * re-validates the same permission independently via requireApp).
 */
export interface ModuleDefinition {
  /** Stable identifier, e.g. 'docker' | 'monitoring' | 'ipmgt'. */
  key: string
  /** Display name, e.g. "Monitoring". */
  name: string
  description: string
  /** Route the launcher/sidebar links to and the module mounts at. */
  routePath: string
  /** Lucide icon name (i-lucide-*), matching the rest of the sidebar. */
  icon: string
  /** Permission required for the entry to be visible/clickable in the UI. */
  permission: Permission
  type: ModuleType
  /** Lower sorts first in the menu. */
  order: number
  /** Default database name used by the first-enable wizard. */
  defaultDatabase: string
  /** Default connection-pool ceiling for this subsystem. */
  defaultPoolMax: number
}

export interface ModuleDatabaseSummary {
  mode: ModuleDatabaseMode
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  poolMax: number
  passwordSet: boolean
}

export interface ModuleRuntimeState {
  key: string
  enabled: boolean
  status: ModuleStatus
  initializedAt: string | null
  updatedAt: string | null
  updatedBy: string | null
  lastError: string | null
  database: ModuleDatabaseSummary | null
}
