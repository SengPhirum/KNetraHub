// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxt/fonts',
    '@vueuse/nuxt'
  ],

  css: ['~/assets/css/main.css'],

  // Bundle the Lucide icon set locally so icons resolve offline / air-gapped
  // instead of fetching from api.iconify.design at runtime.
  icon: {
    serverBundle: { collections: ['lucide'] }
  },

  // SSR is on; the auth shell is rendered client-aware via middleware.
  ssr: true,

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

    // LDAP / Active Directory
    ldap: {
      enabled: process.env.NUXT_LDAP_ENABLED === 'true',
      url: process.env.NUXT_LDAP_URL || 'ldap://localhost:389',
      bindDN: process.env.NUXT_LDAP_BIND_DN || '',
      bindCredentials: process.env.NUXT_LDAP_BIND_PASSWORD || '',
      searchBase: process.env.NUXT_LDAP_SEARCH_BASE || '',
      // {{username}} is substituted at runtime
      searchFilter: process.env.NUXT_LDAP_SEARCH_FILTER || '(uid={{username}})',
      // group -> DockHub role mapping, comma separated "cn=admins:admin,cn=ops:operator"
      groupSearchBase: process.env.NUXT_LDAP_GROUP_BASE || '',
      groupSearchFilter: process.env.NUXT_LDAP_GROUP_FILTER || '(member={{dn}})',
      adminGroup: process.env.NUXT_LDAP_ADMIN_GROUP || '',
      operatorGroup: process.env.NUXT_LDAP_OPERATOR_GROUP || ''
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

    // data dir for the local user/settings store
    dataDir: process.env.NUXT_DATA_DIR || './.data',

    // --- Exposed to the client (safe values only) ---
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'DockHub',
      ldapEnabled: process.env.NUXT_LDAP_ENABLED === 'true',
      gitlabEnabled: !!process.env.NUXT_GITLAB_TOKEN
    }
  },

  ui: {
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
    }
  },

  fonts: {
    families: [
      { name: 'Space Grotesk', provider: 'google' },
      { name: 'Inter', provider: 'google' },
      { name: 'JetBrains Mono', provider: 'google' }
    ]
  },

  app: {
    head: {
      title: 'DockHub - Swarm Console',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Run your Docker Swarm from one hub. A convenient, GitLab-backed Swarm management console.' },
        { name: 'color-scheme', content: 'dark' }
      ]
    }
  }
})
