import type { Migration } from './types'
import { migration as m0001 } from './0001_archive_legacy'
import { migration as m0002 } from './0002_core'
import { migration as m0003 } from './0003_entities'
import { migration as m0004 } from './0004_jobs'
import { migration as m0005 } from './0005_metrics'
import { migration as m0006 } from './0006_events_alerts'
import { migration as m0007 } from './0007_services_apps_billing'
import { migration as m0008 } from './0008_discovery_scans'

/** Ordered, forward-only. Add new migrations at the end — never edit applied ones. */
export const MIGRATIONS: Migration[] = [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008]
