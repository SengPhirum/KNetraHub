export interface Migration {
  /** Ordered, unique id — also the primary key in work.schema_migrations. */
  id: string
  /** SQL statements executed sequentially (not in one wrapping transaction). */
  statements: string[]
  /**
   * Substrings identifying statements whose failure is tolerated (logged,
   * skipped) — reserved for optional extensions. Everything else is fatal.
   */
  tolerant?: string[]
}
