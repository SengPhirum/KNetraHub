/**
 * Shared alert-message interpolation. Deliberately module-agnostic and kept at
 * portal level (like the notification library in notify.ts / notifyStore.ts) so
 * every sub-app's own alert engine can use it without depending on another
 * app's layer. The per-app rule definitions and firing logic live inside each
 * layer (layers/docker, layers/ipmgt, layers/monitoring).
 */

/** Replaces {{key}} tokens; unmatched placeholders are left as-is. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}
