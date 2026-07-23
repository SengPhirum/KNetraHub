import type { Migration } from './types'
import { migration as m0001 } from './0001_core'
import { migration as m0002 } from './0002_tasks'
import { migration as m0003 } from './0003_fields'
import { migration as m0004 } from './0004_collab'

/** Ordered, forward-only. Add new migrations at the end — never edit applied ones. */
export const MIGRATIONS: Migration[] = [m0001, m0002, m0003, m0004]
