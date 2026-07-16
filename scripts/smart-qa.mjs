import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium, firefox, webkit } from 'playwright'

const options = {
  baseUrl: 'http://localhost:3000', scope: 'core', browser: 'chromium',
  screenshotsDir: 'public/screenshots', reportDir: '.qa-results',
  username: '', password: '',
  headed: false, screenshots: true
}

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  const value = () => {
    if (!process.argv[i + 1]) throw new Error(`${arg} requires a value`)
    return process.argv[++i]
  }
  if (arg === '--base-url') options.baseUrl = value()
  else if (arg === '--scope') options.scope = value()
  else if (arg === '--browser') options.browser = value()
  else if (arg === '--screenshots-dir') options.screenshotsDir = value()
  else if (arg === '--report-dir') options.reportDir = value()
  else if (arg === '--username') options.username = value()
  else if (arg === '--password') options.password = value()
  else if (arg === '--password-stdin') options.password = fsSync.readFileSync(0, 'utf8')
  else if (arg === '--headed') options.headed = true
  else if (arg === '--no-screenshots') options.screenshots = false
  else throw new Error(`Unknown argument: ${arg}`)
}

options.baseUrl = options.baseUrl.replace(/\/+$/, '')
const browserType = { chromium, firefox, webkit }[options.browser]
if (!browserType) throw new Error(`Unsupported browser: ${options.browser}`)

const startedAt = new Date()
const results = []
const consoleErrors = []
const screenshotStageDir = path.join(options.reportDir, 'screenshots-pending')
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '\u2713' : '\u2717'} ${name}${detail ? ` - ${detail}` : ''}`)
}

async function apiCheck(name, endpoint, expected = 200) {
  try {
    const response = await fetch(`${options.baseUrl}${endpoint}`, { redirect: 'manual' })
    const ok = response.status === expected
    record(name, ok, `HTTP ${response.status}`)
    return ok
  } catch (error) {
    record(name, false, error.message)
    return false
  }
}

async function visit(page, name, route, screenshot) {
  try {
    const response = await page.goto(`${options.baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(500)
    // Hash-only navigation reuses the current document, so Playwright correctly
    // returns null even though the target view rendered successfully.
    const ok = response ? response.status() < 400 : page.url().startsWith(`${options.baseUrl}${route.split('#')[0]}`)
    record(name, ok, response ? `HTTP ${response.status()}` : 'client navigation')
    if (ok && options.screenshots && screenshot) {
      await page.screenshot({ path: path.join(screenshotStageDir, screenshot), fullPage: false })
    }
    return ok
  } catch (error) {
    record(name, false, error.message)
    return false
  }
}

await fs.mkdir(options.reportDir, { recursive: true })
if (options.screenshots) {
  await fs.rm(screenshotStageDir, { recursive: true, force: true })
  await fs.mkdir(screenshotStageDir, { recursive: true })
  await fs.mkdir(options.screenshotsDir, { recursive: true })
}

await apiCheck('Database-backed health probe', '/api/system/health')
if (options.scope !== 'smoke') {
  await apiCheck('Setup status API', '/api/auth/setup-status')
  await apiCheck('Authentication providers API', '/api/auth/providers')
}

let browser
try {
  browser = await browserType.launch({ headless: !options.headed })
} catch (error) {
  throw new Error(`Cannot start Playwright ${options.browser}. Run './service.sh qa --install-browser'. ${error.message}`)
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  reducedMotion: 'reduce'
})
const page = await context.newPage()
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

await visit(page, 'Login page', '/login', 'login.png')
await visit(page, 'Documentation overview', '/documentation#home', 'docs-overview.png')

if (options.scope !== 'smoke') {
  await visit(page, 'Documentation Q&A', '/documentation#faq', 'docs-qa.png')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K').catch(() => {})
  await page.waitForTimeout(400)
  const searchDialog = page.getByRole('dialog', { name: 'Search documentation' })
  const searchOpened = await searchDialog.isVisible().catch(() => false)
  if (searchOpened) {
    await searchDialog.getByPlaceholder(/Search guides/).fill('how to deploy a stack')
    await page.waitForTimeout(250)
  }
  if (searchOpened && options.screenshots) {
    await page.screenshot({ path: path.join(screenshotStageDir, 'docs-search.png'), fullPage: false })
  }
  record('Documentation smart-search shortcut', searchOpened)
}

let authenticated = false
let dockerAvailable = true
if (options.username && options.password) {
  try {
    const response = await context.request.post(`${options.baseUrl}/api/auth/login`, {
      data: { username: options.username, password: options.password }
    })
    authenticated = response.ok()
    record('Authenticated session API', authenticated, `HTTP ${response.status()}`)
    if (authenticated) {
      const dockerProbe = await context.request.get(`${options.baseUrl}/api/system/overview`)
      dockerAvailable = dockerProbe.ok()
      record(
        'Docker Swarm precondition',
        true,
        dockerAvailable ? `HTTP ${dockerProbe.status()}` : `Skipped live Docker pages: HTTP ${dockerProbe.status()}`
      )
    }
  } catch (error) {
    record('Authenticated session API', false, error.message)
  }
}

if (authenticated) {
  await visit(page, 'Authenticated app launcher', '/', 'portal-home.png')
  let serviceLinks = []
  if (dockerAvailable) {
    await visit(page, 'Docker dashboard', '/docker', 'dock-dashboard.png')
    await visit(page, 'Stacks inventory', '/stacks', 'stacks.png')
    await visit(page, 'Services inventory', '/services', 'services.png')
    serviceLinks = await page.locator('a[href^="/services/"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')).filter(Boolean))
    await visit(page, 'Nodes inventory', '/nodes', 'nodes.png')
  }
  await visit(page, 'Monitoring overview', '/monitoring')
  await visit(page, 'Monitoring device inventory', '/monitoring/devices', 'monitoring-dashboard.png')
  await visit(page, 'Monitoring active alerts', '/monitoring/alerts')
  await visit(page, 'IP Management dashboard', '/ipmgt', 'ipmgt-dashboard.png')
  await visit(page, 'IPAM subnet inventory', '/ipmgt/subnets')

  if (options.scope === 'full') {
    if (dockerAvailable && serviceLinks[0]) await visit(page, 'Service detail', serviceLinks[0], 'service-detail.png')
    else record('Service detail', true, dockerAvailable ? 'Skipped: no services available' : 'Skipped: Docker engine is not an active swarm')
    await visit(page, 'Monitoring data collection coverage', '/monitoring/data-collection')
    await visit(page, 'QA IPAM subnet detail', '/ipmgt/subnets/qa-ipam-subnet')
  }
} else if (options.scope !== 'smoke') {
  record('Authenticated core checks', true, 'Skipped: provide QA_USERNAME and QA_PASSWORD')
}

await browser.close()
const filteredConsoleErrors = [...new Set(consoleErrors)].filter((message) =>
  !message.includes('favicon') && message !== 'Hydration completed but contains mismatches.' &&
  !(dockerAvailable === false && message.includes('not part of an active swarm'))
)
record('Browser console', filteredConsoleErrors.length === 0, filteredConsoleErrors.slice(0, 3).join(' | '))

const report = {
  startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
  baseUrl: options.baseUrl, scope: options.scope, browser: options.browser,
  authenticated, screenshots: options.screenshots, results
}
const reportPath = path.join(options.reportDir, 'smart-qa-report.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

const failures = results.filter((result) => !result.ok)
if (options.screenshots && failures.length === 0) {
  for (const file of await fs.readdir(screenshotStageDir)) {
    await fs.copyFile(path.join(screenshotStageDir, file), path.join(options.screenshotsDir, file))
  }
  await fs.rm(screenshotStageDir, { recursive: true, force: true })
} else if (options.screenshots) {
  console.log(`Pending screenshots retained for diagnosis: ${screenshotStageDir}`)
}
console.log(`\nQA result: ${results.length - failures.length}/${results.length} checks passed`)
console.log(`Report: ${reportPath}`)
if (options.screenshots) console.log(`Documentation screenshots: ${options.screenshotsDir}`)
if (failures.length) process.exitCode = 1
