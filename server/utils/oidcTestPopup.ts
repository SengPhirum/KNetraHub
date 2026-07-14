import type { H3Event } from 'h3'
import type { OidcLoginTestReport } from './oidc'

export const OIDC_TEST_MESSAGE = 'knetrahub:oidc-login-test'

export interface OidcTestPopupMessage {
  type: typeof OIDC_TEST_MESSAGE
  ok: boolean
  report?: OidcLoginTestReport
  error?: string
}

/**
 * Render a same-origin popup result page and mirror its data to the admin page.
 * Provider-controlled claim values are escaped both in markup and in the
 * inline JSON payload so they cannot break out of the page or script.
 */
export function sendOidcTestPopup(event: H3Event, message: OidcTestPopupMessage) {
  const title = message.ok ? 'OIDC login test succeeded' : 'OIDC login test failed'
  const description = message.ok
    ? 'Authorization, token exchange, and ID token validation completed.'
    : (message.error || 'The login test could not be completed.')
  const pretty = JSON.stringify(message.ok ? message.report : { ok: false, error: message.error }, null, 2)
  const scriptPayload = safeScriptJson(message)

  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #07111f; color: #e5edf7; }
    main { width: min(100% - 32px, 920px); margin: 0 auto; padding: 28px 0; }
    .card { border: 1px solid #263549; border-radius: 16px; background: #0d1929; box-shadow: 0 24px 70px #0008; overflow: hidden; }
    header { display: flex; align-items: flex-start; gap: 12px; padding: 20px 22px; border-bottom: 1px solid #263549; }
    .status { display: grid; place-items: center; flex: 0 0 34px; height: 34px; border-radius: 50%; font-weight: 800; background: ${message.ok ? '#0d6b50' : '#8b2735'}; color: white; }
    h1 { margin: 0; font-size: 18px; }
    p { margin: 6px 0 0; color: #97a9bd; font-size: 13px; line-height: 1.5; }
    .body { padding: 18px 22px 22px; }
    .note { margin: 0 0 12px; font-size: 12px; color: #97a9bd; }
    pre { margin: 0; max-height: 66vh; overflow: auto; padding: 16px; border: 1px solid #263549; border-radius: 10px; background: #07111f; color: #d8e6f5; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    footer { display: flex; justify-content: flex-end; padding: 14px 22px; border-top: 1px solid #263549; }
    button { border: 1px solid #36516d; border-radius: 8px; padding: 8px 14px; background: #16283d; color: #e5edf7; cursor: pointer; font: inherit; }
    button:hover { background: #1c334e; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <header>
        <div class="status">${message.ok ? '&#10003;' : '!'}</div>
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      </header>
      <div class="body">
        <p class="note">Raw access, ID, and refresh token values are always redacted. This test does not create a user or replace your current admin session.</p>
        <pre>${escapeHtml(pretty)}</pre>
      </div>
      <footer><button id="close" type="button">Close window</button></footer>
    </section>
  </main>
  <script>
    const result = ${scriptPayload};
    if (window.opener && !window.opener.closed) window.opener.postMessage(result, window.location.origin);
    document.getElementById('close').addEventListener('click', () => window.close());
  </script>
</body>
</html>`
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
