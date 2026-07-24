#!/usr/bin/env node
// KNetraHub PAM — Stage 10 security-invariant scan.
//
// Static assertions over the source for the non-negotiable properties in the
// brief (§2 security constraints + completion gate). This is a heuristic guard,
// NOT a proof — the behavioural proofs live in the unit/integration/E2E suites.
// It exists so a regression that reintroduces a known-bad pattern (a plaintext
// reveal into a table row, a bearer step-up bypass, a credential leaked by the
// metadata API) fails loudly in CI. Exits 0 only if every check passes.
import { readFileSync, existsSync } from 'node:fs'
import process from 'node:process'

const ROOT = process.cwd()
const read = (p) => { try { return readFileSync(`${ROOT}/${p}`, 'utf8') } catch { return null } }
const results = []
function check(name, fn) {
  try { const r = fn(); results.push({ name, ok: r === true, detail: typeof r === 'string' ? r : '' }) }
  catch (e) { results.push({ name, ok: false, detail: e?.message || String(e) }) }
}
const must = (p) => { const c = read(p); if (c == null) throw new Error(`missing file ${p}`); return c }
const has = (c, re) => (re instanceof RegExp ? re.test(c) : c.includes(re))
// Strip JS `//` line comments and Vue/HTML `<!-- -->` comments so pattern checks
// match real code, not documentation that mentions the banned pattern.
const stripComments = (c) => c.replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// 1. Target credentials must NEVER enter the browser via metadata endpoints.
check('account metadata GET does not open/return a credential', () => {
  const c = must('layers/pam/server/api/pam/v1/accounts/[id]/index.get.ts')
  return !has(c, /openActiveCredential|cred\.value|\.password\b/) || 'metadata endpoint references a credential value'
})

// 2. Both reveal endpoints forbid caching the plaintext response.
check('account reveal sets no-store', () => has(must('layers/pam/server/api/pam/v1/accounts/[id]/reveal.post.ts'), 'no-store') || 'missing no-store')
check('secret reveal sets no-store', () => has(must('layers/pam/server/api/pam/v1/secrets/[id]/reveal.post.ts'), 'no-store') || 'missing no-store')

// 3. Step-up is NOT bypassable by a bearer token without an explicit service scope.
check('step-up has no blanket bearer exemption', () => {
  const c = must('layers/pam/server/utils/pamStepUpCore.ts')
  const scopedOnly = has(c, 'hasServiceScope')
  const noBearerShortcut = !/authType\s*===\s*['"]bearer['"]\s*\)\s*return\s*\{\s*ok:\s*true/.test(c)
  return (scopedOnly && noBearerShortcut) || 'bearer may bypass step-up'
})

// 4. The secrets UI no longer uses prompt() and does not render plaintext in a row.
check('secrets page does not use prompt()', () => !has(stripComments(must('layers/pam/app/pages/pam/secrets/index.vue')), /\bprompt\s*\(/) || 'prompt() still present')
check('secrets page reveals via the shared hardened modal', () => has(must('layers/pam/app/pages/pam/secrets/index.vue'), 'PamRevealModal') || 'not using PamRevealModal')
check('shared reveal modal keeps plaintext inside the dialog only', () => {
  const c = must('layers/pam/app/components/PamRevealModal.vue')
  return (has(c, 'x-confirm-password') && has(c, 'countdown')) || 'reveal modal missing step-up/countdown'
})

// 5. One-time secrets use the acknowledge-to-dismiss dialog, not a lingering banner.
check('application token uses the one-time dialog', () => {
  const c = must('layers/pam/app/pages/pam/applications/index.vue')
  return (has(c, 'PamOneTimeSecretModal') && !/UAlert[^>]*newToken/.test(c)) || 'still using a persistent token banner'
})

// 6. Gateway must resolve secrets from files/env and not print them.
check('ssh-gateway does not log the resolved secret', () => {
  const c = read('services/pam/ssh-gateway/main.go')
  if (c == null) return 'gateway source not found (skipped)'
  // Flag only a log call that INTERPOLATES a secret-like value (format directive
  // + a secret/password/credential argument) — not static "…SECRET is required"
  // env-var error strings.
  return !/log\.\w+\("[^"]*%[+#]?[svqxd][^"]*"\s*,[^)]*\b(secret|password|passwd|credential)\b/i.test(c) || 'gateway interpolates a secret-like value into a log'
})

// 7. Runner packages are verified (digest + signature) before load.
check('runner verifies connector packages (digest + signature)', () => {
  const c = must('layers/pam/server/utils/pamRunnerCore.ts')
  return (has(c, /verifyConnectorPackage/) && has(c, /digest/i) && has(c, /signature/i)) || 'package verification incomplete'
})

// 8. Risk auto-responses are actually executed (not just stored).
check('risk engine executes auto-responses', () => {
  const c = must('layers/pam/server/utils/pamRiskEngine.ts')
  return (has(c, 'executeAutoResponse') && has(c, 'block_session') && has(c, "state='terminated'")) || 'auto-response not executed'
})

// 9. Report evidence snapshots carry an integrity checksum.
check('report runs stored with a sha256 checksum', () => {
  const c = must('layers/pam/server/utils/pamReports.ts')
  return (has(c, "createHash('sha256')") && has(c, 'checksum')) || 'report runs lack a checksum'
})

// 10. Certification revoke performs real enforcement.
check('certification revoke enforces (revokes grant / disables account)', () => {
  const c = must('layers/pam/server/utils/pamCertification.ts')
  return (has(c, 'enforceRevoke') && has(c, "status='revoked'")) || 'revoke does not enforce'
})

const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log(`\nPAM security scan: ${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
