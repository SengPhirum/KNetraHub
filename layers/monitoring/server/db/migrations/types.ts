export interface Migration {
  /** Ordered, unique id — also the primary key in monitoring.schema_migrations. */
  id: string
  /** SQL statements executed sequentially (not in one wrapping transaction). */
  statements: string[]
  /**
   * Substrings identifying statements whose failure is tolerated (logged,
   * skipped) — used for optional TimescaleDB features like compression.
   */
  tolerant?: string[]
}
