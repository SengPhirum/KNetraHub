// https://nuxt.com/docs/api/configuration/nuxt-config
//
// Two build modes:
//   npm run build       → full SSR app (Docker Swarm console)
//   npm run build:docs  → static docs only  (NUXT_STATIC_DOCS=true nuxt generate)
//
const isDocsBuild = process.env.NUXT_STATIC_DOCS === 'true'
// Set NUXT_DOCS_BASE_URL to your GitHub Pages subdirectory, e.g. /knetrahub/
// Leave empty (/) for a custom domain or user/org site.
const docsBaseURL = process.env.NUXT_DOCS_BASE_URL || '/'
const ssrEnabled = process.env.NUXT_SSR !== 'false'

export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: process.env.NODE_ENV === 'development' },

  // Docs-only static build: redirect root → /documentation, prerender that single route
  ...(isDocsBuild ? {
    routeRules: {
      '/': { redirect: { to: '/documentation', statusCode: 301 } }
    }
  } : {}),

  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@vite-pwa/nuxt'
  ],

  css: ['~/assets/css/main.css'],

  sourcemap: {
    client: false,
    server: false
  },

  // Bundle the Lucide icon set locally so icons resolve offline / air-gapped
  // instead of fetching from api.iconify.design at runtime.
  icon: {
    serverBundle: { collections: ['lucide'] }
  },

  // SSR is on by default; dev-swarm can opt into SPA mode with NUXT_SSR=false.
  ssr: ssrEnabled,

  runtimeConfig: {
    // --- Server-only secrets (override with NUXT_* env vars in production) ---
    jwtSecret: process.env.NUXT_JWT_SECRET || 'change-me-in-production-please',

    // Docker connection. Defaults to the local unix socket.
    docker: {
      socketPath: process.env.NUXT_DOCKER_SOCKET_PATH || '/var/run/docker.sock',
      host: process.env.NUXT_DOCKER_HOST || '',
      port: process.env.NUXT_DOCKER_PORT || '',
      // TLS (for remote TCP managers). Provide PEM contents or file paths.
      ca: process.env.NUXT_DOCKER_CA || '',
      cert: process.env.NUXT_DOCKER_CERT || '',
      key: process.env.NUXT_DOCKER_KEY || ''
    },
    // Shared secret the knetrahub-agent (global service, one task per swarm
    // node) presents when posting per-node usage stats back to this app.
    agent: {
      token: process.env.NUXT_AGENT_TOKEN || '',
      staleAfterMs: Number(process.env.NUXT_AGENT_STALE_MS || 20000)
    },

    // LDAP / Active Directory
    ldap: {
      enabled: process.env.NUXT_LDAP_ENABLED === 'true',
      url: process.env.NUXT_LDAP_URL || 'ldap://localhost:389',
      bindDN: process.env.NUXT_LDAP_BIND_DN || '',
      bindCredentials: process.env.NUXT_LDAP_BIND_CREDENTIALS || process.env.NUXT_LDAP_BIND_PASSWORD || '',
      searchBase: process.env.NUXT_LDAP_SEARCH_BASE || '',
      // {{username}} is substituted at runtime
      searchFilter: process.env.NUXT_LDAP_SEARCH_FILTER || '(uid={{username}})',
      // group -> KNetraHub role mapping, comma separated "cn=admins:admin,cn=ops:operator"
      groupSearchBase: process.env.NUXT_LDAP_GROUP_SEARCH_BASE || process.env.NUXT_LDAP_GROUP_BASE || '',
      groupSearchFilter: process.env.NUXT_LDAP_GROUP_SEARCH_FILTER || process.env.NUXT_LDAP_GROUP_FILTER || '(member={{dn}})',
      adminGroup: process.env.NUXT_LDAP_ADMIN_GROUP || '',
      operatorGroup: process.env.NUXT_LDAP_OPERATOR_GROUP || ''
    },

    // OIDC / OAuth2 single sign-on (authorization code + PKCE)
    oidc: {
      enabled: process.env.NUXT_OIDC_ENABLED === 'true',
      // e.g. https://keycloak.example.com/realms/main or https://login.microsoftonline.com/{tenant}/v2.0
      issuer: process.env.NUXT_OIDC_ISSUER || '',
      clientId: process.env.NUXT_OIDC_CLIENT_ID || '',
      clientSecret: process.env.NUXT_OIDC_CLIENT_SECRET || '',
      // Defaults to {request origin}/api/auth/oidc/callback when empty
      redirectUri: process.env.NUXT_OIDC_REDIRECT_URI || '',
      scope: process.env.NUXT_OIDC_SCOPE || 'openid profile email groups',
      // Claims used to build the KNetraHub user
      usernameClaim: process.env.NUXT_OIDC_USERNAME_CLAIM || 'preferred_username',
      displayNameClaim: process.env.NUXT_OIDC_DISPLAY_NAME_CLAIM || 'name',
      // Claim holding group names; dot-paths supported (e.g. "realm_access.roles")
      groupsClaim: process.env.NUXT_OIDC_GROUPS_CLAIM || 'groups',
      // Claim holding Keycloak realm roles; these drive per-app access (Settings
      // -> Apps & Access). Dot-paths supported; Keycloak's default is realm_access.roles.
      rolesClaim: process.env.NUXT_OIDC_ROLES_CLAIM || 'realm_access.roles',
      // group -> KNetraHub role mapping; unmatched users become viewers
      adminGroup: process.env.NUXT_OIDC_ADMIN_GROUP || '',
      operatorGroup: process.env.NUXT_OIDC_OPERATOR_GROUP || '',
      // Label shown on the login button
      providerName: process.env.NUXT_OIDC_PROVIDER_NAME || 'SSO'
    },

    // GitLab - used to version stack compose files
    gitlab: {
      url: process.env.NUXT_GITLAB_URL || 'https://gitlab.com',
      token: process.env.NUXT_GITLAB_TOKEN || '',
      projectId: process.env.NUXT_GITLAB_PROJECT_ID || '',
      branch: process.env.NUXT_GITLAB_BRANCH || 'main',
      // folder inside the repo where compose files live
      stacksPath: process.env.NUXT_GITLAB_STACKS_PATH || 'stacks'
    },

    // Postgres + TimescaleDB - one instance: plain tables for app data
    // (users/settings/audit/...), Timescale hypertables for metrics history.
    db: {
      host: process.env.NUXT_DB_HOST || 'localhost',
      port: Number(process.env.NUXT_DB_PORT || 5432),
      database: process.env.NUXT_DB_NAME || 'knetrahub',
      user: process.env.NUXT_DB_USER || 'knetrahub',
      password: process.env.NUXT_DB_PASSWORD || 'knetrahub',
      ssl: process.env.NUXT_DB_SSL === 'true',
      poolMax: Number(process.env.NUXT_DB_POOL_MAX || 10)
    },

    // How long node/container metrics history is retained (Timescale retention policy)
    metrics: {
      retentionDays: Number(process.env.NUXT_METRICS_RETENTION_DAYS || 30)
    },

    // How many audit-log rows to retain. This is a compliance trail, not an
    // operational log, so the default is deliberately large - override for
    // your bank's retention policy (or a Timescale/archival job if you need
    // longer than row-count trimming can reasonably hold).
    audit: {
      retentionRows: Number(process.env.NUXT_AUDIT_RETENTION_ROWS || 200000)
    },

    // Background poller that redeploys services opted into the
    // knetrahub.autoredeploy label when their registry's image digest changes.
    autoredeploy: {
      enabled: process.env.NUXT_AUTOREDEPLOY_ENABLED !== 'false',
      intervalMinutes: Number(process.env.NUXT_AUTOREDEPLOY_INTERVAL_MINUTES || 15),
      timeoutMs: Number(process.env.NUXT_AUTOREDEPLOY_TIMEOUT_MS || 10000)
    },

    // Background poller for usage/node/replica/disk threshold alerts.
    alerts: {
      enabled: process.env.NUXT_ALERTS_ENABLED !== 'false',
      intervalMinutes: Number(process.env.NUXT_ALERTS_INTERVAL_MINUTES || 3)
    },

    // Network module: real device monitoring (ICMP ping + SNMP v1/v2c). The
    // poller pings every device and reads SNMP system/interface data on each
    // cycle; discovery uses the same primitives to scan a CIDR. SNMPv3 needs
    // auth/priv credentials not stored per device yet, so v3 devices are pinged
    // only. Disable polling entirely with NUXT_NET_POLLING_ENABLED=false.
    net: {
      pollingEnabled: process.env.NUXT_NET_POLLING_ENABLED !== 'false',
      pollIntervalSeconds: Number(process.env.NUXT_NET_POLL_INTERVAL_SECONDS || 60),
      pollConcurrency: Number(process.env.NUXT_NET_POLL_CONCURRENCY || 16),
      snmpCommunity: process.env.NUXT_NET_SNMP_COMMUNITY || 'public',
      snmpVersion: process.env.NUXT_NET_SNMP_VERSION || 'v2c',
      snmpTimeoutMs: Number(process.env.NUXT_NET_SNMP_TIMEOUT_MS || 2000),
      pingTimeoutSeconds: Number(process.env.NUXT_NET_PING_TIMEOUT_SECONDS || 2),
      discoveryConcurrency: Number(process.env.NUXT_NET_DISCOVERY_CONCURRENCY || 64)
    },

    // Server module (Zabbix-style): real host monitoring (ICMP ping + SNMP
    // host-resources/UCD metrics). The serverPoller pings every enabled host,
    // collects its SNMP items, evaluates triggers into problems, and fires
    // actions. Disable with NUXT_SERVER_POLLING_ENABLED=false.
    server: {
      pollingEnabled: process.env.NUXT_SERVER_POLLING_ENABLED !== 'false',
      pollIntervalSeconds: Number(process.env.NUXT_SERVER_POLL_INTERVAL_SECONDS || 60),
      pollConcurrency: Number(process.env.NUXT_SERVER_POLL_CONCURRENCY || 16),
      snmpCommunity: process.env.NUXT_SERVER_SNMP_COMMUNITY || 'public',
      snmpVersion: process.env.NUXT_SERVER_SNMP_VERSION || 'v2c',
      snmpTimeoutMs: Number(process.env.NUXT_SERVER_SNMP_TIMEOUT_MS || 2000),
      pingTimeoutSeconds: Number(process.env.NUXT_SERVER_PING_TIMEOUT_SECONDS || 2),
      discoveryConcurrency: Number(process.env.NUXT_SERVER_DISCOVERY_CONCURRENCY || 64),
      webTimeoutMs: Number(process.env.NUXT_SERVER_WEB_TIMEOUT_MS || 8000),
      // SNMP trap receiver: opt-in (off by default — it opens a UDP listener).
      // Defaults to 1162, not the standard 162, since binding <1024 needs root/
      // CAP_NET_BIND_SERVICE; production deployments typically forward 162->1162.
      trapEnabled: process.env.NUXT_SERVER_TRAP_ENABLED === 'true',
      trapPort: Number(process.env.NUXT_SERVER_TRAP_PORT || 1162),
      trapBindAddress: process.env.NUXT_SERVER_TRAP_BIND_ADDRESS || '0.0.0.0'
    },

    // --- Exposed to the client (safe values only) ---
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'KNetraHub',
      staticDocs: isDocsBuild
    }
  },

  colorMode: {
    preference: 'system',
    fallback: 'dark',
    storageKey: 'knetrahub-color-mode'
  },

  ui: {
    // Keep UI fonts local/system-based so dev and build work offline and
    // behind corporate TLS interception without probing remote font providers.
    fonts: false,
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
    }
  },

  nitro: {
    // pg dynamically requires a few optional deps in ways Nitro's bundler
    // can trip on — keep it external rather than bundled. net-snmp and ping
    // (Network monitoring) are kept external too: ping spawns the system binary
    // and net-snmp pulls in BER/buffer deps that are happier left unbundled.
    externals: { external: ['pg', 'net-snmp', 'ping'] },
    // Docs build: only prerender /documentation (and root redirect)
    ...(isDocsBuild ? {
      prerender: {
        routes: ['/', '/documentation'],
        crawlLinks: false,
      }
    } : {})
  },

  app: {
    // Docs build: apply GitHub Pages base URL so asset paths resolve correctly
    baseURL: isDocsBuild ? docsBaseURL : undefined,
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'KNetraHub - Swarm Console',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Run your Docker Swarm from one hub. A convenient, GitLab-backed Swarm management console.' },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'theme-color', content: '#0066ff' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'KNetraHub' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'msapplication-config', content: '/browserconfig.xml' },
        { name: 'msapplication-TileColor', content: '#0066ff' }
      ]
      // favicon/apple-touch-icon/manifest <link> tags are NOT set here - they're
      // injected per-request by app.vue (default static paths, or an admin's
      // Settings > Appearance override). unhead doesn't dedupe multiple
      // rel="icon" links against each other (multiple sizes is normal), so
      // defining them here too would render both sets at once.
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      // KNetraHub is server-rendered and auth-gated - every route's HTML comes
      // fresh from Nitro per request. vite-plugin-pwa's generateSW strategy
      // defaults navigateFallback to "/", which registers a Workbox
      // NavigationRoute that intercepts ALL navigations (any URL, not just
      // "/") and serves the precached/cached "/" response instead of
      // letting them reach the server - the classic SPA app-shell fallback,
      // which is wrong here and was the actual cause of "PWA broken on
      // staging" (installed app stuck showing stale/wrong pages on reload
      // or deep link). Disabling it makes every navigation always hit the
      // network; only static build assets are still precached for speed.
      navigateFallback: null
    },
    includeAssets: [
      'favicon.ico',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon-48x48.png',
      'apple-touch-icon.png',
      'browserconfig.xml'
    ],
    // Manifest is served dynamically by server/routes/manifest.webmanifest.get.ts
    // instead of generated here at build time, so an admin-uploaded PWA icon
    // (Settings -> Appearance) takes effect without a rebuild. That route
    // mirrors these exact defaults when no override is set.
    manifest: false
  }
})
