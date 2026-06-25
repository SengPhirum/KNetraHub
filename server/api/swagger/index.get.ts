export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KNetraHub — API Reference</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    /* ── KNetraHub design tokens ──────────────────────────────────────────────── */
    :root {
      --bg:          #f8fbfd;
      --surface:     #ffffff;
      --surface-2:   #ecf3f7;
      --border:      #d4e0e8;
      --border-soft: #e2ebf1;
      --text:        #132030;
      --text-muted:  #516173;
      --text-faint:  #7b8999;
      --accent:      #0B72C0;
      --accent-bg:   rgba(11,114,192,.08);
      --accent-bdr:  rgba(11,114,192,.22);
      --shadow:      0 1px 3px rgba(15,23,42,.08), 0 4px 12px rgba(15,23,42,.05);
      --shadow-lg:   0 8px 24px rgba(15,23,42,.10);
      --font: "Inter","Segoe UI Variable Text","Segoe UI",ui-sans-serif,system-ui,sans-serif;
      --mono: "JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace;
      color-scheme: light;
      /* Code blocks are always dark regardless of page theme */
      --code-bg:    #0b0f1c;
      --code-border:#1c2640;
      --code-text:  #c8d3e6;
      --code-url:   #7ec8f5;
      /* method palette – light */
      --m-get-bg: #dcfce7;     --m-get-fg: #166534;   --m-get-bdr: #bbf7d0;
      --m-post-bg: #dbeafe;    --m-post-fg: #1e40af;  --m-post-bdr: #bfdbfe;
      --m-put-bg:  #fef3c7;    --m-put-fg:  #92400e;  --m-put-bdr:  #fde68a;
      --m-del-bg:  #fee2e2;    --m-del-fg:  #991b1b;  --m-del-bdr:  #fecaca;
      --m-patch-bg:#e0f2fe;    --m-patch-fg:#075985;  --m-patch-bdr:#bae6fd;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg:          #0a0e16;
        --surface:     #131a28;
        --surface-2:   #1a2334;
        --border:      #232e42;
        --border-soft: #1b2434;
        --text:        #e6edf6;
        --text-muted:  #8a99b0;
        --text-faint:  #5a6a82;
        --accent:      #2496ED;
        --accent-bg:   rgba(36,150,237,.10);
        --accent-bdr:  rgba(36,150,237,.25);
        --shadow:      0 1px 3px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.2);
        --shadow-lg:   0 8px 28px rgba(0,0,0,.35);
        color-scheme: dark;
        --m-get-bg:   rgba(22,101,52,.25);   --m-get-fg:   #4ade80;  --m-get-bdr:  rgba(74,222,128,.2);
        --m-post-bg:  rgba(30,58,138,.25);   --m-post-fg:  #60a5fa;  --m-post-bdr: rgba(96,165,250,.2);
        --m-put-bg:   rgba(120,53,15,.25);   --m-put-fg:   #fbbf24;  --m-put-bdr:  rgba(251,191,36,.2);
        --m-del-bg:   rgba(127,29,29,.25);   --m-del-fg:   #f87171;  --m-del-bdr:  rgba(248,113,113,.2);
        --m-patch-bg: rgba(12,74,110,.25);   --m-patch-fg: #38bdf8;  --m-patch-bdr:rgba(56,189,248,.2);
      }
    }
    .dark {
      --bg:          #0a0e16;
      --surface:     #131a28;
      --surface-2:   #1a2334;
      --border:      #232e42;
      --border-soft: #1b2434;
      --text:        #e6edf6;
      --text-muted:  #8a99b0;
      --text-faint:  #5a6a82;
      --accent:      #2496ED;
      --accent-bg:   rgba(36,150,237,.10);
      --accent-bdr:  rgba(36,150,237,.25);
      --shadow:      0 1px 3px rgba(0,0,0,.3), 0 4px 12px rgba(0,0,0,.2);
      --shadow-lg:   0 8px 28px rgba(0,0,0,.35);
      color-scheme: dark;
      --m-get-bg:   rgba(22,101,52,.25);   --m-get-fg:   #4ade80;  --m-get-bdr:  rgba(74,222,128,.2);
      --m-post-bg:  rgba(30,58,138,.25);   --m-post-fg:  #60a5fa;  --m-post-bdr: rgba(96,165,250,.2);
      --m-put-bg:   rgba(120,53,15,.25);   --m-put-fg:   #fbbf24;  --m-put-bdr:  rgba(251,191,36,.2);
      --m-del-bg:   rgba(127,29,29,.25);   --m-del-fg:   #f87171;  --m-del-bdr:  rgba(248,113,113,.2);
      --m-patch-bg: rgba(12,74,110,.25);   --m-patch-fg: #38bdf8;  --m-patch-bdr:rgba(56,189,248,.2);
    }
    .light {
      --bg:          #f8fbfd;
      --surface:     #ffffff;
      --surface-2:   #ecf3f7;
      --border:      #d4e0e8;
      --border-soft: #e2ebf1;
      --text:        #132030;
      --text-muted:  #516173;
      --text-faint:  #7b8999;
      --accent:      #0B72C0;
      --accent-bg:   rgba(11,114,192,.08);
      --accent-bdr:  rgba(11,114,192,.22);
      --shadow:      0 1px 3px rgba(15,23,42,.08), 0 4px 12px rgba(15,23,42,.05);
      --shadow-lg:   0 8px 24px rgba(15,23,42,.10);
      color-scheme: light;
      --m-get-bg: #dcfce7;     --m-get-fg: #166534;   --m-get-bdr: #bbf7d0;
      --m-post-bg: #dbeafe;    --m-post-fg: #1e40af;  --m-post-bdr: #bfdbfe;
      --m-put-bg:  #fef3c7;    --m-put-fg:  #92400e;  --m-put-bdr:  #fde68a;
      --m-del-bg:  #fee2e2;    --m-del-fg:  #991b1b;  --m-del-bdr:  #fecaca;
      --m-patch-bg:#e0f2fe;    --m-patch-fg:#075985;  --m-patch-bdr:#bae6fd;
    }

    /* ── Reset & base ───────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; }
    html { font-size: 14px; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      -webkit-font-smoothing: antialiased;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
    body::-webkit-scrollbar { width: 7px; }
    body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
    body::-webkit-scrollbar-track { background: transparent; }

    /* ── Sticky header ──────────────────────────────────────────────────────── */
    .dh-header {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 0 20px; height: 52px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow);
    }
    .dh-header-left  { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .dh-header-right { display: flex; align-items: center; gap: 8px; }

    .dh-logo { width: 26px; height: 26px; flex-shrink: 0; }
    .dh-title { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -.02em; }
    .dh-badge {
      font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px;
      background: var(--accent-bg); color: var(--accent); border: 1px solid var(--accent-bdr);
      letter-spacing: .03em; text-transform: uppercase;
    }
    .dh-divider { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
    .dh-version { font-size: 11px; color: var(--text-faint); font-family: var(--mono); }

    .dh-btn {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 500; color: var(--text-muted);
      text-decoration: none; padding: 5px 11px; border-radius: 7px;
      border: 1px solid var(--border); background: transparent;
      cursor: pointer; transition: all .15s; white-space: nowrap; font-family: var(--font);
    }
    .dh-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
    .dh-btn-icon { padding: 5px 8px; }
    .dh-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .dh-auth-status {
      display: flex; align-items: center; gap: 5px;
      font-size: 11.5px; color: var(--text-faint); font-family: var(--mono);
    }
    .dh-auth-dot {
      width: 7px; height: 7px; border-radius: 50%; background: var(--border);
      flex-shrink: 0; transition: background .3s;
    }
    .dh-auth-dot.authed { background: #34d399; box-shadow: 0 0 0 2px rgba(52,211,153,.2); }

    /* ── Main layout ────────────────────────────────────────────────────────── */
    html { height: 100%; }
    body { display: flex; flex-direction: column; min-height: 100%; }
    .dh-header { flex-shrink: 0; }
    /* Swagger block fills the full height below the header even when the spec
       renders short content, so the iframe never shows a dead empty area. */
    #swagger-ui { flex: 1 0 auto; width: 100%; max-width: 1120px; margin: 0 auto; padding: 24px 20px 48px; }

    /* ── Info block ─────────────────────────────────────────────────────────── */
    .swagger-ui { background: transparent; }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .info {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px 24px;
      margin-bottom: 0;
      box-shadow: var(--shadow);
    }
    .swagger-ui .info .title   { color: var(--text); font-size: 20px; font-family: var(--font); font-weight: 700; }
    .swagger-ui .info p        { color: var(--text-muted); font-size: 13px; line-height: 1.65; }
    .swagger-ui .info li       { color: var(--text-muted); font-size: 13px; }
    .swagger-ui .info a        { color: var(--accent); }
    .swagger-ui .info h2       { color: var(--text); font-size: 14px; font-weight: 600; margin-top: 14px; margin-bottom: 4px; }
    .swagger-ui .info code     { background: var(--surface-2); color: var(--accent); border-radius: 4px; padding: 1px 6px; font-family: var(--mono); font-size: .85em; }
    .swagger-ui .info table    { border-collapse: collapse; width: 100%; }
    .swagger-ui .info table thead tr th,
    .swagger-ui .info table thead tr td  { color: var(--text); border-bottom: 1px solid var(--border); padding: 6px 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
    .swagger-ui .info table tbody tr td  { color: var(--text-muted); border-bottom: 1px solid var(--border-soft); padding: 6px 10px; font-size: 12.5px; }
    .swagger-ui .info .version { background: var(--accent-bg); color: var(--accent); border: 1px solid var(--accent-bdr); border-radius: 99px; padding: 2px 10px; font-size: 11px; font-family: var(--mono); }

    /* ── Scheme/authorize container ─────────────────────────────────────────── */
    .swagger-ui .scheme-container {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 20px;
      box-shadow: var(--shadow);
      display: flex; align-items: center; gap: 12px;
    }
    .swagger-ui .schemes > label { display: none; }
    .swagger-ui .auth-wrapper { display: flex; align-items: center; gap: 10px; }
    .swagger-ui .auth-btn-wrapper { gap: 8px; display: flex; align-items: center; }

    /* ── Authorize button ───────────────────────────────────────────────────── */
    .swagger-ui .btn.authorize {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 7px;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 16px;
      box-shadow: 0 2px 8px rgba(36,150,237,.3);
      transition: all .15s;
    }
    .swagger-ui .btn.authorize:hover { filter: brightness(1.1); }
    .swagger-ui .btn.authorize svg   { fill: #fff; width: 14px; height: 14px; }
    .swagger-ui .btn.authorize.locked svg { fill: #fff; }

    /* ── Tag sections ───────────────────────────────────────────────────────── */
    .swagger-ui .opblock-tag-section { margin-bottom: 8px; }
    .swagger-ui .opblock-tag {
      color: var(--text);
      border-bottom: 1px solid var(--border-soft);
      padding: 10px 4px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -.01em;
    }
    .swagger-ui .opblock-tag:hover { background: var(--accent-bg); border-radius: 6px; }
    .swagger-ui .opblock-tag small  { color: var(--text-faint); font-size: 12px; font-weight: 400; }
    .swagger-ui .opblock-tag svg    { fill: var(--text-faint); }

    /* ── Operation blocks ───────────────────────────────────────────────────── */
    .swagger-ui .opblock {
      border-radius: 8px;
      border: 1px solid var(--border);
      margin: 3px 0;
      background: var(--surface);
      box-shadow: none;
      overflow: hidden;
      transition: box-shadow .15s;
    }
    .swagger-ui .opblock:hover { box-shadow: var(--shadow); }
    .swagger-ui .opblock.is-open { box-shadow: var(--shadow); }
    .swagger-ui .opblock .opblock-summary { border-bottom: none; padding: 0; }
    .swagger-ui .opblock .opblock-summary-path {
      color: var(--text); font-family: var(--mono); font-size: 13px; font-weight: 500;
    }
    .swagger-ui .opblock .opblock-summary-path__deprecated { text-decoration: line-through; color: var(--text-faint); }
    .swagger-ui .opblock .opblock-summary-description { color: var(--text-muted); font-size: 12.5px; }
    .swagger-ui .opblock .opblock-summary-operation-id { color: var(--text-faint); font-family: var(--mono); font-size: 11px; }
    .swagger-ui .opblock-body { background: var(--surface-2); border-top: 1px solid var(--border-soft); }
    .swagger-ui .opblock-section-header { background: var(--surface); border-bottom: 1px solid var(--border-soft); padding: 8px 16px; }
    .swagger-ui .opblock-section-header h4 { color: var(--text-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; }
    .swagger-ui .opblock-description-wrapper p { color: var(--text-muted); font-size: 13px; }

    /* HTTP method badges */
    .swagger-ui .opblock-summary-method {
      border-radius: 5px; font-size: 11px; font-weight: 700; min-width: 62px;
      text-align: center; letter-spacing: .04em; padding: 5px 8px;
    }
    .swagger-ui .opblock-get    { border-color: var(--m-get-bdr); }
    .swagger-ui .opblock-get    .opblock-summary-method { background: var(--m-get-bg);   color: var(--m-get-fg); }
    .swagger-ui .opblock-get.is-open    { border-color: var(--m-get-bdr); }
    .swagger-ui .opblock-post   { border-color: var(--m-post-bdr); }
    .swagger-ui .opblock-post   .opblock-summary-method { background: var(--m-post-bg);  color: var(--m-post-fg); }
    .swagger-ui .opblock-post.is-open   { border-color: var(--m-post-bdr); }
    .swagger-ui .opblock-put    { border-color: var(--m-put-bdr); }
    .swagger-ui .opblock-put    .opblock-summary-method { background: var(--m-put-bg);   color: var(--m-put-fg); }
    .swagger-ui .opblock-put.is-open    { border-color: var(--m-put-bdr); }
    .swagger-ui .opblock-delete { border-color: var(--m-del-bdr); }
    .swagger-ui .opblock-delete .opblock-summary-method { background: var(--m-del-bg);   color: var(--m-del-fg); }
    .swagger-ui .opblock-delete.is-open { border-color: var(--m-del-bdr); }
    .swagger-ui .opblock-patch  { border-color: var(--m-patch-bdr); }
    .swagger-ui .opblock-patch  .opblock-summary-method { background: var(--m-patch-bg); color: var(--m-patch-fg); }
    .swagger-ui .opblock-patch.is-open  { border-color: var(--m-patch-bdr); }

    /* ── Parameters & tables ────────────────────────────────────────────────── */
    .swagger-ui table.parameters     { border-collapse: separate; border-spacing: 0; }
    .swagger-ui table.parameters td  { border-bottom: 1px solid var(--border-soft); padding: 8px 12px; vertical-align: top; }
    .swagger-ui table.parameters tr:last-child td { border-bottom: none; }
    .swagger-ui .parameter__name     { color: var(--text); font-weight: 600; font-size: 13px; font-family: var(--mono); }
    .swagger-ui .parameter__type     { color: var(--accent); font-size: 11.5px; font-family: var(--mono); }
    .swagger-ui .parameter__in       { color: var(--text-faint); font-size: 11px; border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; background: var(--surface-2); }
    .swagger-ui .parameter__deprecated { color: #f87171; }
    .swagger-ui .parameter__empty_value_toggle { color: var(--accent); }

    /* ── Form inputs ────────────────────────────────────────────────────────── */
    .swagger-ui select,
    .swagger-ui input[type=text],
    .swagger-ui input[type=password],
    .swagger-ui input[type=email],
    .swagger-ui input[type=number],
    .swagger-ui textarea {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 12.5px;
      padding: 6px 10px;
      transition: border-color .15s;
    }
    .swagger-ui select:focus,
    .swagger-ui input[type=text]:focus,
    .swagger-ui input[type=password]:focus,
    .swagger-ui textarea:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-bg); }
    .swagger-ui textarea { font-family: var(--mono); font-size: 12px; }

    /* ── Buttons ────────────────────────────────────────────────────────────── */
    .swagger-ui .btn              { border-radius: 6px; font-weight: 500; font-size: 12.5px; font-family: var(--font); transition: all .15s; }
    .swagger-ui .btn.execute      { background: var(--accent); color: #fff; border-color: var(--accent); box-shadow: 0 2px 6px rgba(36,150,237,.25); }
    .swagger-ui .btn.execute:hover{ filter: brightness(1.08); }
    .swagger-ui .btn.cancel       { background: transparent; border-color: var(--border); color: var(--text-muted); }
    .swagger-ui .btn.cancel:hover { border-color: var(--text-faint); color: var(--text); }
    .swagger-ui .btn.try-out__btn { background: transparent; border-color: var(--accent-bdr); color: var(--accent); }
    .swagger-ui .btn.try-out__btn:hover { background: var(--accent-bg); }
    .swagger-ui .btn.btn-clear    { background: transparent; border-color: var(--border); color: var(--text-muted); }
    .swagger-ui .copy-to-clipboard { background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; }
    .swagger-ui .copy-to-clipboard:hover { border-color: var(--accent); }
    .swagger-ui .copy-to-clipboard button { color: var(--text-muted); }

    /* ── Responses ──────────────────────────────────────────────────────────── */
    .swagger-ui .responses-inner    { background: var(--surface-2); }
    .swagger-ui table.responses-table td { border-bottom: 1px solid var(--border-soft); padding: 8px 12px; vertical-align: top; }
    .swagger-ui .response-col_status { color: var(--text); font-weight: 600; font-family: var(--mono); font-size: 13px; }
    .swagger-ui .response-col_description p { color: var(--text-muted); font-size: 13px; }
    .swagger-ui .response-col_links  { color: var(--text-faint); }
    /* live response table after execution */
    .swagger-ui .live-responses-table td { border-bottom: 1px solid var(--border-soft); vertical-align: top; }
    /* height-cap the live response body so it scrolls */
    .swagger-ui .live-responses-table .highlight-code { max-height: 360px; overflow-y: auto !important; }
    /* response headers block */
    .swagger-ui .headers-wrapper { max-height: 200px; overflow-y: auto; border-top: 1px solid var(--code-border); }
    .swagger-ui .headers-wrapper .header-value { color: var(--code-text) !important; font-family: var(--mono) !important; font-size: 11.5px !important; }
    /* status colour coding */
    .swagger-ui .response .response-col_status.status-200,
    .swagger-ui .response .response-col_status.status-201,
    .swagger-ui .response .response-col_status.status-204 { color: #34d399; }
    .swagger-ui .response .response-col_status.status-400,
    .swagger-ui .response .response-col_status.status-401,
    .swagger-ui .response .response-col_status.status-403,
    .swagger-ui .response .response-col_status.status-404,
    .swagger-ui .response .response-col_status.status-422,
    .swagger-ui .response .response-col_status.status-500 { color: #f87171; }
    .swagger-ui .response-control-media-type__accept-message { color: var(--text-faint); }

    /* ── Code blocks — always dark ─────────────────────────────────────────────
       microlight injects inline color on each <span> (specificity beats class
       rules), so CSS alone can't recolour tokens per theme. Keeping code blocks
       on a permanent dark surface means the built-in green/blue token colours
       stay legible in both light and dark page modes — matching the convention
       used by Stripe, GitHub, and most modern API docs.              ────────── */

    .swagger-ui .highlight-code,
    .swagger-ui .curl-command,
    .swagger-ui .request-url {
      background: var(--code-bg) !important;
      border: 1px solid var(--code-border) !important;
      border-radius: 7px !important;
      overflow: hidden !important;
    }

    /* Height caps with scroll — applies whether content is short or massive */
    .swagger-ui .highlight-code { max-height: 340px; overflow-y: auto !important; scrollbar-width: thin; scrollbar-color: #2a3a56 transparent; }
    .swagger-ui .curl-command   { max-height: 160px; overflow-y: auto !important; scrollbar-width: thin; scrollbar-color: #2a3a56 transparent; }

    .swagger-ui .microlight {
      background: var(--code-bg) !important;
      color: var(--code-text) !important;
      border-radius: 0 !important;
      padding: 14px 16px !important;
      margin: 0 !important;
      display: block !important;
      font-family: var(--mono) !important;
      font-size: 12px !important;
      line-height: 1.75 !important;
      white-space: pre-wrap !important;
      word-break: break-all !important;
    }

    /* curl text */
    .swagger-ui .curl-command .curl {
      background: var(--code-bg) !important;
      color: var(--code-text) !important;
      font-family: var(--mono) !important;
      font-size: 12px !important;
      line-height: 1.75 !important;
      padding: 14px 16px !important;
      display: block !important;
      white-space: pre-wrap !important;
      word-break: break-all !important;
    }

    /* request URL bar */
    .swagger-ui .request-url { padding: 10px 14px !important; }
    .swagger-ui .request-url span,
    .swagger-ui .request-url pre { color: var(--code-url) !important; font-family: var(--mono) !important; font-size: 12px !important; background: transparent !important; }

    /* request body textarea (Try it out) — dark too */
    .swagger-ui .body-param textarea,
    .swagger-ui textarea.body-param__text {
      background: var(--code-bg) !important;
      color: var(--code-text) !important;
      border-color: var(--code-border) !important;
      max-height: 280px !important;
      overflow-y: auto !important;
      font-family: var(--mono) !important;
      font-size: 12px !important;
      line-height: 1.7 !important;
      resize: vertical !important;
    }
    .swagger-ui .body-param textarea:focus,
    .swagger-ui textarea.body-param__text:focus {
      border-color: var(--accent) !important;
      box-shadow: 0 0 0 3px var(--accent-bg) !important;
      outline: none !important;
    }

    /* copy-to-clipboard button on dark blocks */
    .swagger-ui .copy-to-clipboard { background: #1c2640 !important; border: 1px solid #2a3a56 !important; border-radius: 5px; }
    .swagger-ui .copy-to-clipboard:hover { border-color: var(--accent) !important; }
    .swagger-ui .copy-to-clipboard button { color: #8a99b0 !important; }

    .swagger-ui .response-control-media-type--accept-controller { background: var(--surface-2); }

    /* ── Models ─────────────────────────────────────────────────────────────── */
    .swagger-ui section.models          { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
    .swagger-ui section.models.is-open h4 { border-bottom: 1px solid var(--border); color: var(--text); padding: 12px 16px; margin: 0; }
    .swagger-ui .model-box              { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 6px; padding: 10px 12px; }
    .swagger-ui .model                  { color: var(--text-muted); font-size: 12.5px; font-family: var(--mono); }
    .swagger-ui .model-title            { color: var(--text); font-size: 13px; font-weight: 600; }
    .swagger-ui .model-title__text      { color: var(--text); }
    .swagger-ui .model .property        { color: var(--text); }
    .swagger-ui .model .property-type   { color: var(--accent); }
    .swagger-ui span.prop-type          { color: var(--accent); }
    .swagger-ui span.prop-format        { color: var(--text-faint); }
    .swagger-ui .toggle-handle          { background: var(--border); }

    /* ── Auth dialog ────────────────────────────────────────────────────────── */
    .swagger-ui .dialog-ux              { background: transparent; }
    .swagger-ui .modal-ux               { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); overflow: hidden; }
    .swagger-ui .modal-ux-header        { background: var(--surface-2); border-bottom: 1px solid var(--border); padding: 16px 20px; }
    .swagger-ui .modal-ux-header h3     { color: var(--text); font-size: 15px; font-weight: 700; }
    .swagger-ui .modal-ux-header button { color: var(--text-faint); }
    .swagger-ui .modal-ux-header button:hover { color: var(--text); }
    .swagger-ui .modal-ux-content       { padding: 0; }
    .swagger-ui .auth-container         { border-bottom: 1px solid var(--border-soft); padding: 16px 20px; }
    .swagger-ui .auth-container:last-of-type { border-bottom: none; }
    .swagger-ui .auth-container h4      { color: var(--text); font-size: 13px; font-weight: 600; font-family: var(--mono); margin-bottom: 4px; }
    .swagger-ui .auth-container p       { color: var(--text-muted); font-size: 12.5px; }
    .swagger-ui .auth-container code    { background: var(--surface-2); color: var(--accent); border-radius: 4px; padding: 1px 6px; font-family: var(--mono); }
    .swagger-ui .scopes h2              { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .07em; }
    .swagger-ui .scopes .checkbox       { color: var(--text-muted); }
    .swagger-ui .auth-container .btn-done { background: var(--accent); color: #fff; border-color: var(--accent); border-radius: 7px; }
    .swagger-ui .auth-container .btn-done:hover { filter: brightness(1.1); }
    .swagger-ui .auth-container input   { width: 100%; max-width: 440px; }

    /* ── Filter / search ────────────────────────────────────────────────────── */
    .swagger-ui .filter-container { padding: 0; }
    .swagger-ui .operation-filter-input {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-family: var(--font);
      font-size: 13px;
      padding: 8px 14px;
      width: 100%;
      transition: border-color .15s;
    }
    .swagger-ui .operation-filter-input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-bg); }
    .swagger-ui .operation-filter-input::placeholder { color: var(--text-faint); }

    /* ── Server select ──────────────────────────────────────────────────────── */
    .swagger-ui .servers { display: none; }

    /* ── Loading indicator ──────────────────────────────────────────────────── */
    .swagger-ui .loading-container { background: var(--bg); }
    .swagger-ui .loading-container .loading::after { border-color: var(--accent) transparent var(--accent) transparent; }

    /* ── Misc ───────────────────────────────────────────────────────────────── */
    .swagger-ui .wrapper { padding: 0; max-width: 100%; }
    .swagger-ui .information-container { margin-bottom: 16px; }
    .swagger-ui .scheme-container     { margin-bottom: 16px; }
    .swagger-ui .renderedMarkdown p   { color: var(--text-muted); font-size: 13px; }
    .swagger-ui .renderedMarkdown code { background: var(--surface-2); color: var(--accent); border-radius: 4px; padding: 1px 5px; font-family: var(--mono); }
    .swagger-ui .prop-name            { color: var(--text); font-family: var(--mono); font-weight: 600; }
    .swagger-ui .property.primitive span { color: var(--text-muted); }
    .swagger-ui svg.arrow             { fill: var(--text-faint); }
    .swagger-ui .no-margin            { margin: 0; }
    .swagger-ui .opblock-tag h3       { font-size: 14px; font-weight: 600; }
    .swagger-ui .expand-methods svg,
    .swagger-ui .expand-operation svg { fill: var(--text-faint); }
    .swagger-ui .expand-methods:hover svg,
    .swagger-ui .expand-operation:hover svg { fill: var(--accent); }
  </style>
</head>
<body>
  <!-- Apply color mode from KNetraHub localStorage preference BEFORE render -->
  <script>
    (function () {
      var pref = localStorage.getItem('knetrahub-color-mode') || 'system';
      if (pref === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (pref === 'light') {
        document.documentElement.classList.add('light');
      }
      // 'system' falls through to @media (prefers-color-scheme)
    })();
  </script>

  <!-- Sticky header -->
  <header class="dh-header">
    <div class="dh-header-left">
      <svg class="dh-logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#2496ED"/>
        <rect x="6"  y="10" width="4" height="4" rx="1" fill="white" opacity=".9"/>
        <rect x="13" y="10" width="4" height="4" rx="1" fill="white" opacity=".9"/>
        <rect x="20" y="10" width="6" height="4" rx="1" fill="white" opacity=".9"/>
        <rect x="6"  y="17" width="4" height="4" rx="1" fill="white" opacity=".65"/>
        <rect x="13" y="17" width="4" height="4" rx="1" fill="white" opacity=".65"/>
        <path d="M5 23 Q10 20 16 21.5 Q22 23 27 21" stroke="white" stroke-width="1.5" fill="none" opacity=".55"/>
      </svg>
      <span class="dh-title">KNetraHub</span>
      <span class="dh-badge">REST API</span>
      <span class="dh-divider"></span>
      <span class="dh-version">v1.0</span>
    </div>
    <div class="dh-header-right">
      <div class="dh-auth-status" id="auth-status" title="Authorization status">
        <span class="dh-auth-dot" id="auth-dot"></span>
        <span id="auth-label">Not authorized</span>
      </div>
      <span class="dh-divider"></span>
      <a class="dh-btn" href="/preferences#api-tokens" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        API Tokens
      </a>
      <button class="dh-btn dh-btn-icon" id="theme-toggle" title="Toggle color mode" onclick="toggleTheme()">
        <svg id="theme-icon-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg id="theme-icon-sun" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </button>
    </div>
  </header>

  <div id="swagger-ui"></div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    // ── Color mode toggle ──────────────────────────────────────────────────────
    function getEffectiveMode() {
      var pref = localStorage.getItem('knetrahub-color-mode') || 'system';
      if (pref === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      return pref;
    }

    function syncThemeIcon() {
      var dark = getEffectiveMode() === 'dark';
      document.getElementById('theme-icon-moon').style.display = dark ? '' : 'none';
      document.getElementById('theme-icon-sun').style.display  = dark ? 'none' : '';
    }

    function toggleTheme() {
      var next = getEffectiveMode() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('knetrahub-color-mode', next);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(next);
      syncThemeIcon();
    }

    syncThemeIcon();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeIcon);

    // ── Auth status indicator ──────────────────────────────────────────────────
    function syncAuthStatus() {
      try {
        var swaggerUI = window.ui;
        if (!swaggerUI) return;
        var authStore = swaggerUI.getSystem().getState().getIn(['auth', 'authorized']);
        var authed = authStore && authStore.size > 0;
        var dot   = document.getElementById('auth-dot');
        var label = document.getElementById('auth-label');
        if (authed) {
          dot.classList.add('authed');
          label.textContent = 'Authorized';
        } else {
          dot.classList.remove('authed');
          label.textContent = 'Not authorized';
        }
      } catch (e) {}
    }

    // ── Swagger UI init ────────────────────────────────────────────────────────
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api/swagger/openapi',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        docExpansion: 'list',
        filter: true,
        onComplete: function () {
          syncAuthStatus();
          // Poll auth state lightly so the indicator stays accurate
          setInterval(syncAuthStatus, 800);
        }
      });
    };
  </script>
</body>
</html>`
})
