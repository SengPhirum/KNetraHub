// https://nuxt.com/docs/api/configuration/nuxt-config
//
// Two build modes:
//   npm run build       → full SSR app (Docker Swarm console)
//   npm run build:docs  → static docs only  (NUXT_STATIC_DOCS=true nuxt generate)
//
const isDocsBuild = process.env.NUXT_STATIC_DOCS === 'true'
// Set NUXT_DOCS_BASE_URL to your GitHub Pages subdirectory, e.g. /dockhub/
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
    // Shared secret the dockhub-agent (global service, one task per swarm
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
      // group -> DockHub role mapping, comma separated "cn=admins:admin,cn=ops:operator"
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
      // Claims used to build the DockHub user
      usernameClaim: process.env.NUXT_OIDC_USERNAME_CLAIM || 'preferred_username',
      displayNameClaim: process.env.NUXT_OIDC_DISPLAY_NAME_CLAIM || 'name',
      // Claim holding group names; dot-paths supported (e.g. "realm_access.roles")
      groupsClaim: process.env.NUXT_OIDC_GROUPS_CLAIM || 'groups',
      // group -> DockHub role mapping; unmatched users become viewers
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
      database: process.env.NUXT_DB_NAME || 'dockhub',
      user: process.env.NUXT_DB_USER || 'dockhub',
      password: process.env.NUXT_DB_PASSWORD || 'dockhub',
      ssl: process.env.NUXT_DB_SSL === 'true',
      poolMax: Number(process.env.NUXT_DB_POOL_MAX || 10)
    },

    // How long node/container metrics history is retained (Timescale retention policy)
    metrics: {
      retentionDays: Number(process.env.NUXT_METRICS_RETENTION_DAYS || 30)
    },

    // Background poller that redeploys services opted into the
    // dockhub.autoredeploy label when their registry's image digest changes.
    autoredeploy: {
      enabled: process.env.NUXT_AUTOREDEPLOY_ENABLED !== 'false',
      intervalMinutes: Number(process.env.NUXT_AUTOREDEPLOY_INTERVAL_MINUTES || 15),
      timeoutMs: Number(process.env.NUXT_AUTOREDEPLOY_TIMEOUT_MS || 10000)
    },

    // --- Exposed to the client (safe values only) ---
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'DockHub',
      gitlabEnabled: !!process.env.NUXT_GITLAB_TOKEN,
      staticDocs: isDocsBuild
    }
  },

  colorMode: {
    preference: 'system',
    fallback: 'dark',
    storageKey: 'dockhub-color-mode'
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
    // can trip on — keep it external rather than bundled.
    externals: { external: ['pg'] },
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
      title: 'DockHub - Swarm Console',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Run your Docker Swarm from one hub. A convenient, GitLab-backed Swarm management console.' },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'theme-color', content: '#0066ff' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'DockHub' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'msapplication-config', content: '/browserconfig.xml' },
        { name: 'msapplication-TileColor', content: '#0066ff' }
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      // DockHub is server-rendered and auth-gated - every route's HTML comes
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
    manifest: {
      name: 'DockHub',
      short_name: 'DockHub',
      description: 'DockHub - Docker Swarm and container management dashboard.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#ffffff',
      theme_color: '#0066ff',
      categories: ['developer', 'productivity', 'utilities'],
      icons: [
        { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    }
  }
})
