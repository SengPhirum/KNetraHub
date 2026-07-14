<script setup lang="ts">
const configurationSections = [
  {
    id: 'integration',
    eyebrow: 'Integration',
    title: 'System and integration configuration',
    summary: 'These options connect KNetraHub to Docker, GitLab, persistent storage, and the visible app shell.',
    guides: [
      {
        id: 'runtime-config',
        title: 'Runtime configuration model',
        icon: 'i-lucide-sliders-horizontal',
        summary: 'Environment variables provide first-run defaults. Authentication, GitLab, Alerts, and Appearance settings saved in the UI are stored in Postgres and override those defaults until reset.',
        options: [
          ['NUXT_JWT_SECRET', 'Secret used to sign session tokens and to derive the key that encrypts stored credentials. Use a long random value in production.'],
          ['NUXT_ADMIN_USERNAME', 'First-run local admin username, created only when no users exist.'],
          ['NUXT_ADMIN_PASSWORD', 'First-run local admin password, created only when no users exist.'],
          ['NUXT_DB_HOST / PORT / NAME / USER / PASSWORD', 'Postgres + TimescaleDB connection. Stores users, settings, audit log, and metrics history.'],
          ['NUXT_METRICS_RETENTION_DAYS', 'Days of node/container/disk/network metrics history kept before it is dropped. Defaults to 30.'],
          ['NUXT_PUBLIC_APP_NAME', 'Default app name shown in the header and browser metadata; Settings > Appearance can override it, plus the logo and brand color, without restarting.']
        ],
        steps: [
          'Copy .env.example to .env before the first run.',
          'Set NUXT_JWT_SECRET and the first-run admin credentials before production use.',
          'Point NUXT_DB_* at a reachable Postgres + TimescaleDB instance before starting the app.',
          'Use Settings for LDAP, OIDC, GitLab, Alerts, and Appearance changes that should be stored in the database instead of container env.'
        ],
        env: ['NUXT_JWT_SECRET', 'NUXT_ADMIN_USERNAME', 'NUXT_ADMIN_PASSWORD', 'NUXT_DB_HOST', 'NUXT_DB_PORT', 'NUXT_DB_NAME', 'NUXT_DB_USER', 'NUXT_DB_PASSWORD', 'NUXT_METRICS_RETENTION_DAYS', 'NUXT_PUBLIC_APP_NAME']
      },
      {
        id: 'appearance-config',
        title: 'Appearance & branding',
        icon: 'i-lucide-paintbrush',
        summary: 'Rebrand the running app without a rebuild: app name, brand color, logos, favicon, and PWA/app icon. Saved from Settings > Appearance as a database override - no env vars required.',
        options: [
          ['App name', 'Shown in the sidebar header, browser tab title, and PWA manifest name. Defaults to NUXT_PUBLIC_APP_NAME or "KNetraHub".'],
          ['Primary color', 'Hex color driving buttons, links, and accents app-wide, plus the PWA theme color.'],
          ['Horizontal logo', 'Wordmark shown on the login screen. Falls back to the built-in KNetraHub logo when unset.'],
          ['Icon logo', 'Square icon shown in the sidebar and header. Falls back to the built-in KNetraHub icon when unset.'],
          ['Favicon', 'Browser tab icon. Falls back to the built-in favicon set when unset.'],
          ['PWA / app icon', 'Installed-app and home-screen icon - drives the web app manifest icons and the Apple touch icon. Falls back to the built-in icon set when unset.']
        ],
        steps: [
          'Open Settings > Appearance (admin only).',
          'Edit the app name and color, and/or upload logos, favicon, and PWA icon - each under about 1.5 MB.',
          'Watch the live preview update instantly; nothing is shared with other users yet.',
          'Click Save appearance to apply for everyone, or Revert preview to discard unsaved edits.',
          'Use Reset to defaults to remove the database override and return to the built-in branding. Favicon and PWA icon changes take effect immediately on the next page load - no rebuild needed.'
        ],
        env: ['NUXT_PUBLIC_APP_NAME']
      },
      {
        id: 'docker-config',
        title: 'Docker engine',
        icon: 'i-lucide-container',
        summary: 'KNetraHub must reach a Docker Swarm manager. Use the local socket for co-located installs or TCP/TLS for remote managers.',
        options: [
          ['NUXT_DOCKER_SOCKET_PATH', 'Unix socket path for local Docker access. Default is /var/run/docker.sock.'],
          ['NUXT_DOCKER_HOST', 'Remote Docker manager hostname or IP. When set, TCP mode is used instead of the socket.'],
          ['NUXT_DOCKER_PORT', 'Remote Docker manager port, usually 2376 for TLS.'],
          ['NUXT_DOCKER_CA', 'CA certificate PEM content or file path for remote TLS.'],
          ['NUXT_DOCKER_CERT', 'Client certificate PEM content or file path for remote TLS.'],
          ['NUXT_DOCKER_KEY', 'Client private key PEM content or file path for remote TLS.']
        ],
        steps: [
          'For local installs, mount /var/run/docker.sock into the app container.',
          'For remote installs, set host and port for a manager node.',
          'For TLS, provide the CA, client certificate, and client key.',
          'Confirm the connected node is a manager because swarm writes require manager access.'
        ],
        env: ['NUXT_DOCKER_SOCKET_PATH', 'NUXT_DOCKER_HOST', 'NUXT_DOCKER_PORT', 'NUXT_DOCKER_CA', 'NUXT_DOCKER_CERT', 'NUXT_DOCKER_KEY']
      },
      {
        id: 'gitlab-config',
        title: 'GitLab stack versioning',
        icon: 'i-lucide-git-branch',
        summary: 'GitLab stores compose files under a repository path so stack changes have commit history and rollback points. Configure it from environment defaults or entirely from Dock > Settings > Integrations - the token is encrypted at rest either way.',
        options: [
          ['NUXT_GITLAB_URL', 'GitLab instance base URL. Defaults to https://gitlab.com.'],
          ['NUXT_GITLAB_TOKEN', 'Personal, project, or deploy token with API access to the configured project. Encrypted at rest; shown masked in the UI.'],
          ['NUXT_GITLAB_PROJECT_ID', 'Numeric GitLab project ID that stores compose files.'],
          ['NUXT_GITLAB_BRANCH', 'Branch where compose files are committed. Defaults to main.'],
          ['NUXT_GITLAB_STACKS_PATH', 'Repository folder for stack compose files. Defaults to stacks.'],
          ['Connection status', 'The status dot in Settings turns green only when KNetraHub actually reaches the project with the saved token, distinguishing unreachable from invalid token.']
        ],
        steps: [
          'Create or choose a GitLab project for operations state.',
          'Create a token with API access to the project.',
          'Set the URL, project ID, branch, and stacks path - via env vars or Dock > Settings > Integrations.',
          'Reload Settings and confirm the status dot turns green.',
          'Deploy a stack and verify the compose file appears under the configured path.',
          'Use stack history to view or roll back saved compose versions. Remove stops a stack\'s services but keeps its GitLab definition; once it shows status Defined, use Delete from GitLab to remove the compose file and history too.'
        ],
        env: ['NUXT_GITLAB_URL', 'NUXT_GITLAB_TOKEN', 'NUXT_GITLAB_PROJECT_ID', 'NUXT_GITLAB_BRANCH', 'NUXT_GITLAB_STACKS_PATH']
      },
      {
        id: 'alerts-config',
        title: 'Alerts & notifications',
        icon: 'i-lucide-bell',
        summary: 'Notify Telegram, Microsoft Teams, or any generic webhook when something needs attention. Configure channels and per-rule thresholds from Settings > Alerts; channel credentials are encrypted at rest.',
        options: [
          ['Channels', 'Telegram (bot token + chat ID), Microsoft Teams (incoming webhook URL), or generic Webhook (URL + custom headers). Add as many as needed - every enabled channel receives every alert.'],
          ['Deploy failed', 'Fires immediately when a stack deploy, rollback, redeploy, image update, or scale operation fails.'],
          ['Service usage threshold', 'Fires when a service\'s CPU and/or memory usage crosses a configurable percentage of its limit, reservation, or node capacity. Default 90%.'],
          ['Node down', 'Fires when a swarm node stops reporting heartbeats.'],
          ['Replicas degraded', 'Fires when a service stays under its desired replica count past a configurable grace period.'],
          ['Disk usage threshold', 'Fires when a node\'s disk usage crosses a configurable percentage. Default 85%.'],
          ['NUXT_ALERTS_ENABLED', 'Default state of the background poller that checks usage/node/replica/disk conditions. Defaults to true.'],
          ['NUXT_ALERTS_INTERVAL_MINUTES', 'How often that poller runs, in minutes. Defaults to 3.']
        ],
        steps: [
          'Open Settings > Alerts and add a channel (Telegram, Teams, or Webhook).',
          'Use the channel\'s Test action to confirm delivery before relying on it.',
          'Enable or disable each rule and adjust its threshold where applicable.',
          'Open Customize message on a rule to edit its template using the listed {{placeholder}} fields, or Reset to restore the default.',
          'Trigger a real deploy failure or threshold breach once to confirm end-to-end delivery.'
        ],
        env: ['NUXT_ALERTS_ENABLED', 'NUXT_ALERTS_INTERVAL_MINUTES']
      },
      {
        id: 'alerts-telegram',
        title: 'Notifications: Telegram',
        icon: 'i-lucide-send',
        summary: 'Send alerts to a Telegram chat or channel through a bot you create with @BotFather. KNetraHub posts each alert as a plain text message via the Bot API - no webhook setup needed on Telegram\'s side.',
        options: [
          ['Bot token', 'Issued by @BotFather when you create the bot. Looks like 123456789:ABCdefGhIJKlmNoPQRstuVwXyz. Encrypted at rest; shown masked in Settings.'],
          ['Chat ID', 'Numeric ID of the user, group, or channel the bot should message. Negative for groups/channels (for example -1001234567890), positive for a direct user chat.'],
          ['Scope', 'One bot token can message many chats - add one KNetraHub channel per chat ID you want to notify.']
        ],
        steps: [
          'Open a chat with @BotFather in Telegram and send /newbot.',
          'Choose a display name and a username ending in "bot", then copy the bot token BotFather replies with.',
          'Add the bot to the target group or channel (or just open a direct chat with it), and send any message so the bot can see that chat.',
          'Visit https://api.telegram.org/bot<token>/getUpdates in a browser (with your token in place of <token>) and read the chat.id value from the JSON response - that is the chat ID.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Telegram, paste the bot token and chat ID, then save.',
          'Use the channel\'s Test action and confirm the message arrives in the chat before relying on it.'
        ],
        env: []
      },
      {
        id: 'alerts-teams',
        title: 'Notifications: Microsoft Teams',
        icon: 'i-lucide-users',
        summary: 'Send alerts to a Teams channel using a classic Incoming Webhook connector. KNetraHub posts each alert as a MessageCard for broad compatibility across Teams tenants.',
        options: [
          ['Webhook URL', 'The unique URL Teams generates for the Incoming Webhook connector on one specific channel. Encrypted at rest; shown masked in Settings.'],
          ['Scope', 'A webhook URL is tied to one channel - add a separate KNetraHub channel per Teams channel you want to notify.'],
          ['Card format', 'Alerts are posted as a classic MessageCard. If your tenant has disabled classic connectors, use a Workflow-based webhook URL instead - the URL works the same way once issued.']
        ],
        steps: [
          'In Teams, open the target channel, click the "..." menu, and choose Connectors (or Workflows on tenants where classic connectors are retired).',
          'Add/configure "Incoming Webhook", give it a name such as KNetraHub Alerts, and optionally upload an icon.',
          'Copy the generated webhook URL - Teams only displays it once, so save it somewhere safe immediately.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Microsoft Teams, paste the webhook URL, then save.',
          'Use the channel\'s Test action and confirm a card posts to the channel before relying on it.'
        ],
        env: []
      },
      {
        id: 'alerts-webhook',
        title: 'Notifications: Generic webhook',
        icon: 'i-lucide-webhook',
        summary: 'Send alerts as a JSON POST to any URL you control - useful for Slack incoming webhooks, custom automation, or a chat tool not natively supported.',
        options: [
          ['URL', 'Endpoint KNetraHub sends the POST request to. Encrypted at rest; shown masked in Settings.'],
          ['Headers', 'Optional, one per line written as "Key: Value" - use this for an Authorization header or any other header your endpoint requires.'],
          ['Payload', 'KNetraHub POSTs JSON shaped { "text": "<rendered alert message>" }. Most chat-style webhooks, including Slack\'s, read a top-level text field.']
        ],
        steps: [
          'Stand up or choose an endpoint that accepts a POST with a JSON body and returns a 2xx status.',
          'If the endpoint needs authentication, note the exact header name and value it expects, for example Authorization: Bearer <token>.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Webhook, enter the URL, and add any headers one per line as Key: Value.',
          'Use the channel\'s Test action and confirm your endpoint receives the request and returns success.',
          'For Slack, paste its "Incoming Webhook" app URL directly into the URL field - no extra headers are needed.'
        ],
        env: []
      }
    ]
  },
  {
    id: 'authentication',
    eyebrow: 'Authentication',
    title: 'Authentication and role mapping',
    summary: 'KNetraHub supports always-available local users, LDAP / Active Directory, and OIDC SSO. Authentication defaults can be overridden from the admin UI.',
    guides: [
      {
        id: 'local-auth',
        title: 'Local accounts',
        icon: 'i-lucide-user-round-cog',
        summary: 'Local users are stored in the KNetraHub database and are useful for first-run access, break-glass administration, and smaller teams.',
        options: [
          ['First-run admin', 'Created from NUXT_ADMIN_USERNAME and NUXT_ADMIN_PASSWORD only when no users exist.'],
          ['Availability', 'Local authentication is permanent recovery access and cannot be disabled.'],
          ['Hidden login', 'Hide the local form on the normal login page; /login?local=1 always reveals it.'],
          ['Password policy', 'Configure minimum length plus uppercase, lowercase, number, and special-character requirements.'],
          ['Session timeout', 'Sets the absolute lifetime of newly issued browser sessions for every provider.'],
          ['Roles', 'Viewer can read, operator can control workloads, admin can manage users/settings/integrations.'],
          ['Fallback access', 'Keep one tested local admin while rolling out LDAP or OIDC.']
        ],
        steps: [
          'Set the first-run admin credentials before bootstrapping production.',
          'Configure password and session rules under Admin > Authentication > Local users.',
          'Create named local users from Users when needed.',
          'If the local form is hidden, securely retain the /login?local=1 recovery URL.',
          'Use a local admin to recover access if external identity providers are down.'
        ],
        env: ['NUXT_ADMIN_USERNAME', 'NUXT_ADMIN_PASSWORD', 'NUXT_JWT_SECRET', 'NUXT_LOCAL_AUTH_HIDE_LOGIN', 'NUXT_LOCAL_AUTH_SESSION_TIMEOUT_MINUTES', 'NUXT_LOCAL_AUTH_PASSWORD_MIN_LENGTH', 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_UPPERCASE', 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_LOWERCASE', 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_NUMBER', 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_SPECIAL']
      },
      {
        id: 'oidc-config',
        title: 'OIDC SSO',
        icon: 'i-lucide-key-round',
        summary: 'OIDC uses authorization code flow with PKCE and discovers provider endpoints from the issuer URL.',
        options: [
          ['NUXT_OIDC_ENABLED', 'Turns OIDC login on by default. UI overrides can also enable or disable it.'],
          ['NUXT_OIDC_ISSUER', 'Provider issuer URL. KNetraHub reads {issuer}/.well-known/openid-configuration.'],
          ['NUXT_OIDC_CLIENT_ID', 'Client ID registered at the provider.'],
          ['NUXT_OIDC_CLIENT_SECRET', 'Client secret for confidential clients.'],
          ['NUXT_OIDC_REDIRECT_URI', 'Optional callback override. Blank means {origin}/api/auth/oidc/callback.'],
          ['NUXT_OIDC_SCOPE', 'Requested scopes. Default is openid profile email groups.'],
          ['NUXT_OIDC_USERNAME_CLAIM', 'Claim used as KNetraHub username. Default is preferred_username.'],
          ['NUXT_OIDC_DISPLAY_NAME_CLAIM', 'Claim used as display name. Default is name.'],
          ['NUXT_OIDC_GROUPS_CLAIM', 'Claim that carries group names. Dot paths such as realm_access.roles are supported.'],
          ['NUXT_OIDC_ADMIN_GROUP', 'Group value mapped to the admin role.'],
          ['NUXT_OIDC_OPERATOR_GROUP', 'Group value mapped to the operator role.'],
          ['NUXT_OIDC_PROVIDER_NAME', 'Login button label, for example Keycloak, Authentik, or Company SSO.']
        ],
        steps: [
          'Create an OIDC client in your identity provider.',
          'Register the KNetraHub callback URL exactly.',
          'Copy issuer, client ID, and client secret into Settings > Authentication.',
          'Expose group membership in an ID token or userinfo claim.',
          'Map provider groups to admin and operator roles, then test with one user from each role.'
        ],
        env: ['NUXT_OIDC_ENABLED', 'NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_REDIRECT_URI', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_USERNAME_CLAIM', 'NUXT_OIDC_DISPLAY_NAME_CLAIM', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_ADMIN_GROUP', 'NUXT_OIDC_OPERATOR_GROUP', 'NUXT_OIDC_PROVIDER_NAME']
      },
      {
        id: 'keycloak',
        title: 'OIDC: Keycloak',
        icon: 'i-lucide-landmark',
        summary: 'Use a confidential OpenID Connect client in a realm dedicated to infrastructure access.',
        options: [
          ['Issuer', 'https://keycloak.example.com/realms/infrastructure'],
          ['Client ID', 'knetrahub'],
          ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback'],
          ['Scope', 'openid profile email groups'],
          ['Groups claim', 'groups from a Group Membership mapper.'],
          ['Role groups', 'swarm-admins and swarm-operators, or your own group names.']
        ],
        steps: [
          'Create or choose a realm, for example infrastructure.',
          'Create an OpenID Connect client with Client ID knetrahub.',
          'Enable client authentication so Keycloak issues a client secret.',
          'Keep standard authorization code flow enabled.',
          'Add the exact KNetraHub callback URL as a valid redirect URI and the KNetraHub origin as a web origin.',
          'Add a Group Membership mapper with token claim name groups.',
          'Copy the realm issuer, client ID, and secret into KNetraHub.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_ADMIN_GROUP', 'NUXT_OIDC_OPERATOR_GROUP']
      },
      {
        id: 'authentik',
        title: 'OIDC: Authentik',
        icon: 'i-lucide-fingerprint',
        summary: 'Create an Authentik application with an OAuth2/OpenID provider, then use the provider issuer and client credentials in KNetraHub.',
        options: [
          ['Issuer', 'Default per-provider issuer such as https://authentik.example.com/application/o/knetrahub/.'],
          ['Client type', 'Confidential client with a client ID and client secret.'],
          ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback as an authorization redirect URI.'],
          ['Scope', 'openid profile email groups.'],
          ['Groups claim', 'groups, or a custom property mapping that returns group names.'],
          ['Provider name', 'Authentik or your organization SSO label.']
        ],
        steps: [
          'Create a new Application in Authentik, for example KNetraHub.',
          'Create or attach an OAuth2/OpenID provider.',
          'Set the redirect URI to the exact KNetraHub callback URL.',
          'Use the default per-provider issuer mode unless your environment requires a global issuer.',
          'Copy the provider client ID, client secret, and issuer URL into KNetraHub.',
          'Make sure the selected scopes or property mappings include username, email, display name, and groups.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_PROVIDER_NAME']
      },
      {
        id: 'generic-oidc',
        title: 'OIDC: Other providers',
        icon: 'i-lucide-circle-ellipsis',
        summary: 'Most standards-based OIDC providers work when they support discovery, authorization code flow, PKCE, and a usable groups claim.',
        options: [
          ['Discovery', 'The issuer must expose /.well-known/openid-configuration with authorization, token, and JWKS endpoints.'],
          ['Callback', 'The provider must allow the exact KNetraHub callback URL.'],
          ['Claims', 'Use preferred_username/name/groups when available, or adjust the claim fields in Settings.'],
          ['Groups', 'If groups are nested, set a dot path such as realm_access.roles.'],
          ['Userinfo fallback', 'KNetraHub checks userinfo when the ID token does not include the configured groups claim.']
        ],
        steps: [
          'Create a web or confidential OIDC application.',
          'Enable authorization code flow and PKCE when the provider asks.',
          'Register the callback URL shown in KNetraHub Settings.',
          'Request openid profile email groups or the provider equivalent.',
          'Test with a user that should be viewer, operator, and admin.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_USERNAME_CLAIM', 'NUXT_OIDC_DISPLAY_NAME_CLAIM', 'NUXT_OIDC_GROUPS_CLAIM']
      },
      {
        id: 'ldap-config',
        title: 'LDAP / Active Directory',
        icon: 'i-lucide-building-2',
        summary: 'LDAP login binds with a service account, searches for the user, verifies the password as that user, then maps memberOf groups to KNetraHub roles.',
        options: [
          ['NUXT_LDAP_ENABLED', 'Turns LDAP login on by default. UI overrides can also enable or disable it.'],
          ['NUXT_LDAP_URL', 'Directory URL such as ldaps://ldap.example.com:636.'],
          ['NUXT_LDAP_BIND_DN', 'Service account DN used to search for users.'],
          ['NUXT_LDAP_BIND_CREDENTIALS', 'Service account password.'],
          ['NUXT_LDAP_SEARCH_BASE', 'Base DN for user lookups.'],
          ['NUXT_LDAP_SEARCH_FILTER', 'Search filter with {{username}}, for example (uid={{username}}).'],
          ['NUXT_LDAP_GROUP_SEARCH_BASE', 'Optional group search base for future group lookup expansion.'],
          ['NUXT_LDAP_GROUP_SEARCH_FILTER', 'Optional group filter. Default is (member={{dn}}).'],
          ['NUXT_LDAP_ADMIN_GROUP', 'Admin group DN or matching string.'],
          ['NUXT_LDAP_OPERATOR_GROUP', 'Operator group DN or matching string.']
        ],
        steps: [
          'Use LDAPS when possible and confirm KNetraHub can reach the directory.',
          'Create a least-privilege bind account that can search users and read group membership.',
          'Set the user search base and filter.',
          'Map admin and operator group DNs to KNetraHub roles.',
          'Test one user from each expected role and one user with no mapped group.'
        ],
        env: ['NUXT_LDAP_ENABLED', 'NUXT_LDAP_URL', 'NUXT_LDAP_BIND_DN', 'NUXT_LDAP_BIND_CREDENTIALS', 'NUXT_LDAP_SEARCH_BASE', 'NUXT_LDAP_SEARCH_FILTER', 'NUXT_LDAP_GROUP_SEARCH_BASE', 'NUXT_LDAP_GROUP_SEARCH_FILTER', 'NUXT_LDAP_ADMIN_GROUP', 'NUXT_LDAP_OPERATOR_GROUP']
      }
    ]
  }
]

const keycloakKeyValues = [
  ['Realm', 'infrastructure'],
  ['Client ID', 'knetrahub'],
  ['Client authentication', 'On'],
  ['Valid redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback'],
  ['Web origin', 'https://knetrahub.example.com']
]

const knetrahubOidcValues = [
  ['Provider label', 'Keycloak'],
  ['Issuer URL', 'https://keycloak.example.com/realms/infrastructure'],
  ['Client ID', 'knetrahub'],
  ['Scope', 'openid profile email groups'],
  ['Groups claim', 'groups'],
  ['Admin group', 'swarm-admins'],
  ['Operator group', 'swarm-operators']
]

const authentikValues = [
  ['Application', 'KNetraHub'],
  ['Provider', 'OAuth2/OpenID'],
  ['Issuer mode', 'Per-provider'],
  ['Issuer URL', 'https://authentik.example.com/application/o/knetrahub/'],
  ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback']
]

const keycloakSteps = [
  {
    title: '1. Create or choose a realm',
    body: 'Use a realm dedicated to infrastructure access, for example infrastructure. The KNetraHub issuer URL will end with /realms/infrastructure.'
  },
  {
    title: '2. Create an OpenID Connect client',
    body: 'In Clients, create a client with Client ID knetrahub and Client type OpenID Connect. Use a confidential client by enabling client authentication.'
  },
  {
    title: '3. Configure login settings',
    body: 'Keep the standard authorization code flow enabled. Add the KNetraHub callback URL as a valid redirect URI and add the KNetraHub origin as a web origin.'
  },
  {
    title: '4. Copy the client secret',
    body: 'Open the client Credentials tab and copy the generated secret into KNetraHub. Rotate it if it was exposed.'
  },
  {
    title: '5. Add groups and memberships',
    body: 'Create groups such as swarm-admins and swarm-operators. Add users to the group that matches their KNetraHub role.'
  },
  {
    title: '6. Add a groups claim mapper',
    body: 'In the client dedicated scope or a client scope assigned to KNetraHub, add a Group Membership mapper with token claim name groups. Include it in the ID token or userinfo response.'
  }
]

const knetrahubSteps = [
  {
    title: '1. Open Settings > Authentication',
    body: 'Enable OIDC single sign-on and keep local admin access available until SSO is tested.'
  },
  {
    title: '2. Paste provider values',
    body: 'Use the issuer URL, client ID, and client secret from the provider. Do not include the /.well-known/openid-configuration suffix.'
  },
  {
    title: '3. Confirm callback URL',
    body: 'Leave Redirect URI blank when the shown effective URL is the public URL users reach. Set it explicitly when KNetraHub is behind a proxy.'
  },
  {
    title: '4. Map claims and groups',
    body: 'Use preferred_username for username, name for display name, groups for groups claim, and the same group values you configured at the provider.'
  },
  {
    title: '5. Save and test',
    body: 'Click Save OIDC, sign out, and test the SSO login button. Verify the synced user has the expected role in Users.'
  }
]

const authentikSteps = [
  {
    title: '1. Create application and provider',
    body: 'In Authentik, create an Application named KNetraHub and attach an OAuth2/OpenID provider.'
  },
  {
    title: '2. Configure redirect URI',
    body: 'Add the KNetraHub callback URL as an authorization redirect URI. It must match the effective redirect URI shown in KNetraHub.'
  },
  {
    title: '3. Keep per-provider issuer mode',
    body: 'The default per-provider issuer produces an issuer like https://authentik.example.com/application/o/knetrahub/. Copy that value into KNetraHub.'
  },
  {
    title: '4. Confirm scopes and claims',
    body: 'Allow openid, profile, email, and groups, or add property mappings that expose equivalent username, display name, email, and groups claims.'
  },
  {
    title: '5. Save and test',
    body: 'Set provider label to Authentik, save OIDC, then test login with users from admin, operator, and viewer paths.'
  }
]

const troubleshooting = [
  ['Invalid redirect_uri', 'The provider redirect URI must exactly match KNetraHub effective redirect URI, including scheme, host, path, and port.'],
  ['OIDC discovery failed', 'Use the issuer URL only, not the /.well-known/openid-configuration URL. Confirm KNetraHub can reach the provider from the server.'],
  ['User logs in as viewer', 'The groups claim did not match admin/operator values, or the provider did not include groups in ID token/userinfo.'],
  ['Client authentication failed', 'Check the client secret and confirm the provider client is configured as confidential when a secret is required.'],
  ['Works locally but not through proxy', 'Set NUXT_OIDC_REDIRECT_URI or the UI Redirect URI to the external HTTPS callback URL.']
]
</script>

<template>
  <div>
    <PageHeader title="Configuration" subtitle="System options, integrations, authentication providers, and setup guides" icon="i-lucide-sliders-horizontal" />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <aside class="hidden xl:block">
        <nav class="sticky top-24 space-y-5 text-sm">
          <div v-for="section in configurationSections" :key="section.id">
            <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">{{ section.eyebrow }}</p>
            <a
              v-for="guide in section.guides"
              :key="guide.id"
              :href="`#${guide.id}`"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-(--color-muted) hover:bg-(--color-veil) hover:text-foam"
            >
              <UIcon :name="guide.icon" class="size-4 text-faint" />
              {{ guide.title }}
            </a>
          </div>
        </nav>
      </aside>

      <main class="min-w-0 space-y-10">
        <section
          v-for="section in configurationSections"
          :id="section.id"
          :key="section.id"
          class="space-y-4 scroll-mt-24"
        >
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-faint">{{ section.eyebrow }}</p>
            <h2 class="mt-1 font-display text-xl font-semibold text-foam">{{ section.title }}</h2>
            <p class="mt-2 max-w-3xl text-sm text-(--color-muted)">{{ section.summary }}</p>
          </div>

          <div class="grid gap-4">
            <article
              v-for="guide in section.guides"
              :id="guide.id"
              :key="guide.id"
              class="scroll-mt-24 rounded-lg border border-hull bg-surface p-5"
            >
              <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
                <div>
                  <div class="flex items-center gap-2">
                    <UIcon :name="guide.icon" class="size-4 text-beacon" />
                    <h3 class="font-display text-base font-semibold text-foam">{{ guide.title }}</h3>
                  </div>
                  <p class="mt-2 text-sm text-(--color-muted)">{{ guide.summary }}</p>

                  <div class="mt-4 space-y-2">
                    <div v-for="[name, description] in guide.options" :key="name" class="option-row">
                      <code>{{ name }}</code>
                      <p>{{ description }}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">Setup checklist</p>
                  <ol class="space-y-2 text-sm text-(--color-muted)">
                    <li v-for="(step, index) in guide.steps" :key="step" class="flex gap-2">
                      <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                        {{ index + 1 }}
                      </span>
                      <span>{{ step }}</span>
                    </li>
                  </ol>

                  <template v-if="guide.env?.length">
                    <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-faint">Related env vars</p>
                    <div class="flex flex-wrap gap-2">
                      <code v-for="key in guide.env" :key="key" class="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-beacon ring-1 ring-hull">
                        {{ key }}
                      </code>
                    </div>
                  </template>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="provider-guides" class="space-y-5 scroll-mt-24">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-faint">OIDC provider guide</p>
            <h2 class="mt-1 font-display text-xl font-semibold text-foam">Keycloak and Authentik setup details</h2>
            <p class="mt-2 max-w-3xl text-sm text-(--color-muted)">
              KNetraHub validates ID tokens using the provider discovery document and JWKS, then maps the configured groups claim to viewer, operator, or admin.
            </p>
          </div>

          <div class="grid gap-5 lg:grid-cols-2">
            <article class="space-y-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-landmark" class="size-4 text-beacon" />
                <h3 class="font-display text-base font-semibold text-foam">Keycloak side</h3>
              </div>
              <ol class="space-y-3 text-sm text-(--color-muted)">
                <li v-for="step in keycloakSteps" :key="step.title">
                  <p class="font-medium text-foam">{{ step.title }}</p>
                  <p class="mt-1">{{ step.body }}</p>
                </li>
              </ol>
            </article>

            <figure class="doc-shot">
              <div class="shot-toolbar">
                <span />
                <span />
                <span />
                <p>Keycloak client settings</p>
              </div>
              <div class="shot-body">
                <div class="rounded-lg border border-hull bg-abyss p-3">
                  <p class="text-sm font-semibold text-foam">Client details</p>
                  <div class="mt-3 space-y-2">
                    <div v-for="[label, value] in keycloakKeyValues" :key="label" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                      <span class="text-faint">{{ label }}</span>
                      <span class="truncate font-mono text-(--color-muted)">{{ value }}</span>
                    </div>
                  </div>
                </div>
                <div class="mt-3 rounded-lg border border-hull bg-abyss p-3">
                  <p class="text-sm font-semibold text-foam">Groups mapper</p>
                  <div class="mt-3 grid gap-2 text-xs">
                    <div class="shot-row">
                      <span>Mapper type</span>
                      <span>Group Membership</span>
                      <span class="justify-self-end text-running">On</span>
                    </div>
                    <div class="shot-row">
                      <span>Token claim</span>
                      <span class="font-mono">groups</span>
                      <span class="justify-self-end text-running">ID token</span>
                    </div>
                  </div>
                </div>
              </div>
            </figure>
          </div>

          <div class="grid gap-5 lg:grid-cols-2">
            <article class="space-y-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-fingerprint" class="size-4 text-beacon" />
                <h3 class="font-display text-base font-semibold text-foam">Authentik side</h3>
              </div>
              <ol class="space-y-3 text-sm text-(--color-muted)">
                <li v-for="step in authentikSteps" :key="step.title">
                  <p class="font-medium text-foam">{{ step.title }}</p>
                  <p class="mt-1">{{ step.body }}</p>
                </li>
              </ol>
            </article>

            <figure class="doc-shot">
              <div class="shot-toolbar">
                <span />
                <span />
                <span />
                <p>Authentik provider settings</p>
              </div>
              <div class="shot-body">
                <div class="rounded-lg border border-hull bg-abyss p-3">
                  <p class="text-sm font-semibold text-foam">Application provider</p>
                  <div class="mt-3 space-y-2">
                    <div v-for="[label, value] in authentikValues" :key="label" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                      <span class="text-faint">{{ label }}</span>
                      <span class="truncate font-mono text-(--color-muted)">{{ value }}</span>
                    </div>
                  </div>
                </div>
                <div class="mt-3 rounded-lg bg-beacon/10 px-3 py-2 text-xs text-beacon ring-1 ring-beacon/20">
                  In KNetraHub, use the issuer value only. The discovery path is added automatically.
                </div>
              </div>
            </figure>
          </div>

          <div class="grid gap-5 lg:grid-cols-2">
            <article class="space-y-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-anchor" class="size-4 text-beacon" />
                <h3 class="font-display text-base font-semibold text-foam">KNetraHub side</h3>
              </div>
              <ol class="space-y-3 text-sm text-(--color-muted)">
                <li v-for="step in knetrahubSteps" :key="step.title">
                  <p class="font-medium text-foam">{{ step.title }}</p>
                  <p class="mt-1">{{ step.body }}</p>
                </li>
              </ol>
            </article>

            <figure class="doc-shot">
              <div class="shot-toolbar">
                <span />
                <span />
                <span />
                <p>KNetraHub OIDC settings</p>
              </div>
              <div class="shot-body">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-semibold text-foam">OIDC single sign-on</p>
                  <span class="rounded-md bg-running/10 px-2 py-1 text-xs font-medium text-running">Enabled</span>
                </div>
                <div class="mt-3 space-y-2">
                  <div v-for="[label, value] in knetrahubOidcValues" :key="label" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                    <span class="text-faint">{{ label }}</span>
                    <span class="truncate font-mono text-(--color-muted)">{{ value }}</span>
                  </div>
                </div>
                <div class="mt-3 rounded-lg bg-beacon/10 px-3 py-2 text-xs text-beacon ring-1 ring-beacon/20">
                  Save OIDC, sign out, then test the SSO login button.
                </div>
              </div>
            </figure>
          </div>

          <article class="rounded-lg border border-hull bg-surface p-5">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-stethoscope" class="size-4 text-beacon" />
              <h3 class="font-display text-base font-semibold text-foam">Authentication troubleshooting</h3>
            </div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div v-for="[problem, fix] in troubleshooting" :key="problem" class="rounded-lg bg-surface-2 p-3 ring-1 ring-hull">
                <p class="text-sm font-medium text-foam">{{ problem }}</p>
                <p class="mt-1 text-xs text-(--color-muted)">{{ fix }}</p>
              </div>
            </div>
          </article>

          <div class="rounded-lg border border-hull bg-abyss p-4 text-sm text-(--color-muted)">
            <p class="font-medium text-foam">Reference links</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                to="https://www.keycloak.org/docs/latest/server_admin/index.html"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-lucide-external-link"
                label="Keycloak Server Administration"
              />
              <UButton
                to="https://www.keycloak.org/securing-apps/oidc-layers"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-lucide-external-link"
                label="Keycloak OIDC endpoints"
              />
              <UButton
                to="https://docs.goauthentik.io/add-secure-apps/providers/oauth2/"
                target="_blank"
                color="neutral"
                variant="soft"
                icon="i-lucide-external-link"
                label="Authentik OAuth2 provider"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.option-row {
  display: grid;
  grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr);
  gap: 0.75rem;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-surface-2) 66%, transparent);
  padding: 0.7rem 0.8rem;
}

.option-row code {
  overflow-wrap: anywhere;
  color: var(--color-beacon);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.option-row p {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.doc-shot {
  overflow: hidden;
  border: 1px solid var(--color-hull);
  border-radius: 0.75rem;
  background: var(--color-abyss);
  box-shadow: var(--panel-shadow-soft);
}

.shot-toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-bottom: 1px solid var(--color-hull-soft);
  background: var(--color-surface);
  padding: 0.65rem 0.8rem;
}

.shot-toolbar span {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--color-hull);
}

.shot-toolbar p {
  min-width: 0;
  margin-left: 0.45rem;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-body {
  padding: 1rem;
}

.shot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--color-surface-2) 72%, transparent);
  padding: 0.55rem 0.65rem;
  font-size: 0.75rem;
}

@media (max-width: 640px) {
  .option-row {
    grid-template-columns: 1fr;
  }
}
</style>
