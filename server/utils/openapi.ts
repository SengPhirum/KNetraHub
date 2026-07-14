export function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'KNetraHub API',
      version: '1.0.0',
      description: [
        'REST API for KNetraHub — Docker Swarm management console.',
        '',
        '## Authentication',
        'All endpoints (except `/auth/login` and `/auth/providers`) require authentication.',
        'Generate an **API token** from **Preferences → API Tokens**, then click **Authorize** and',
        'enter the token. Tokens are sent as `Authorization: Bearer <token>`.',
        '',
        '## Roles',
        '| Role | Access |',
        '|------|--------|',
        '| `viewer` | Read-only access to all resources |',
        '| `operator` | Deploy, scale, and manage resources |',
        '| `admin` | Full access including users, registries, and settings |'
      ].join('\n')
    },
    servers: [{ url: '/api', description: 'KNetraHub API' }],
    components: {
      securitySchemes: {
        ApiToken: {
          type: 'http',
          scheme: 'bearer',
          description: 'API token — generate at **Preferences → API Tokens** (`dhub_…`)'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer', example: 400 },
            statusMessage: { type: 'string', example: 'Bad request' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['viewer', 'operator', 'manager', 'admin'] },
            source: { type: 'string', enum: ['local', 'ldap', 'oidc'] },
            createdAt: { type: 'string', format: 'date-time' },
            lastLogin: { type: 'string', format: 'date-time' }
          }
        },
        ApiToken: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            name: { type: 'string' },
            prefix: { type: 'string', example: 'abc12345', description: 'First 8 chars of the token for identification' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: 'string', format: 'date-time' }
          }
        },
        ApiTokenCreated: {
          allOf: [
            { $ref: '#/components/schemas/ApiToken' },
            {
              type: 'object',
              properties: {
                token: { type: 'string', example: 'dhub_abc123…', description: 'Full token value — shown only once' }
              }
            }
          ]
        },
        Service: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            stack: { type: 'string', nullable: true },
            image: { type: 'string' },
            mode: { type: 'string', enum: ['replicated', 'global'] },
            replicas: { type: 'integer', nullable: true },
            running: { type: 'integer' },
            ports: { type: 'array', items: { type: 'object', properties: { published: { type: 'integer' }, target: { type: 'integer' }, protocol: { type: 'string' } } } },
            updatedAt: { type: 'string', format: 'date-time' },
            updateState: { type: 'string', nullable: true }
          }
        },
        Node: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            hostname: { type: 'string' },
            role: { type: 'string', enum: ['manager', 'worker'] },
            status: { type: 'string' },
            availability: { type: 'string', enum: ['active', 'pause', 'drain'] },
            engineVersion: { type: 'string' },
            addr: { type: 'string' },
            leader: { type: 'boolean' },
            cpu: { type: 'number' },
            memoryMb: { type: 'number' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Stack: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            services: { type: 'integer' },
            running: { type: 'integer' }
          }
        },
        Registry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            url: { type: 'string' },
            username: { type: 'string' }
          }
        },
        AuditEntry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ts: { type: 'string', format: 'date-time' },
            actor: { type: 'string' },
            action: { type: 'string' },
            target: { type: 'string' },
            detail: { type: 'string' }
          }
        },
        Preferences: {
          type: 'object',
          properties: {
            theme: { type: 'string', enum: ['system', 'dark', 'light'] },
            refreshInterval: { type: 'integer', description: 'Seconds; 0 = manual only' },
            density: { type: 'string', enum: ['default', 'compact', 'comfortable'] }
          }
        },
        IpamSection: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string', nullable: true },
            parent_id: { type: 'string', nullable: true }, strict_mode: { type: 'boolean' }, active: { type: 'boolean' }
          }
        },
        IpamSubnet: {
          type: 'object',
          properties: {
            id: { type: 'string' }, network: { type: 'string', example: '10.0.1.0/24' }, name: { type: 'string' },
            version: { type: 'integer', enum: [4, 6] }, section_id: { type: 'string', nullable: true },
            vrf_id: { type: 'string', nullable: true }, location_id: { type: 'string', nullable: true },
            customer_id: { type: 'string', nullable: true }, gateway: { type: 'string', nullable: true },
            allow_requests: { type: 'boolean' }, scan_enabled: { type: 'boolean' }, ping_enabled: { type: 'boolean' },
            usage: { type: 'object', properties: { capacity: { type: 'integer' }, used: { type: 'integer' }, free: { type: 'integer' }, percent: { type: 'integer' } } }
          }
        },
        IpamAddress: {
          type: 'object',
          properties: {
            id: { type: 'string' }, subnet_id: { type: 'string' }, ip: { type: 'string' },
            hostname: { type: 'string', nullable: true }, mac: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['used', 'reserved', 'dhcp', 'offline', 'deprecated', 'gateway'] },
            customer_id: { type: 'string', nullable: true }, device_id: { type: 'string', nullable: true }
          }
        },
        IpamDevice: {
          type: 'object',
          properties: {
            id: { type: 'string' }, hostname: { type: 'string' }, device_type: { type: 'string', nullable: true },
            management_ip: { type: 'string', nullable: true }, location_id: { type: 'string', nullable: true },
            customer_id: { type: 'string', nullable: true }, status: { type: 'string' },
            snmp_community_set: { type: 'boolean', description: 'True if a community string is stored - the value itself is never returned' },
            snmp_auth_password_set: { type: 'boolean' }, snmp_priv_password_set: { type: 'boolean' }
          }
        },
        IpamLocation: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, city: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true }, latitude: { type: 'number', nullable: true }, longitude: { type: 'number', nullable: true },
            parent_id: { type: 'string', nullable: true }
          }
        },
        IpamCustomer: {
          type: 'object',
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, status: { type: 'string', enum: ['active', 'reserved', 'inactive'] },
            contact_person: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }
          }
        },
        IpamRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' }, subnet_id: { type: 'string' }, requested_ip: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['submitted', 'approved', 'rejected', 'cancelled'] },
            requester: { type: 'string' }, approver: { type: 'string', nullable: true }, assigned_ip: { type: 'string', nullable: true }
          }
        },
        IpamVaultItemMeta: {
          type: 'object',
          description: 'Vault item metadata - never includes the secret value; use POST /ipmgt/vault/{id}/reveal for that.',
          properties: {
            id: { type: 'string' }, name: { type: 'string' },
            item_type: { type: 'string', enum: ['password', 'api_credential', 'certificate', 'note'] },
            owner: { type: 'string', nullable: true }, expiry_date: { type: 'string', nullable: true, format: 'date' }
          }
        }
      }
    },
    security: [{ ApiToken: [] }],
    tags: [
      { name: 'auth', description: 'Authentication and session management' },
      { name: 'tokens', description: 'API token management' },
      { name: 'services', description: 'Docker Swarm services' },
      { name: 'stacks', description: 'Docker Swarm stacks (compose)' },
      { name: 'nodes', description: 'Swarm nodes' },
      { name: 'tasks', description: 'Service tasks' },
      { name: 'containers', description: 'Containers' },
      { name: 'networks', description: 'Docker networks' },
      { name: 'volumes', description: 'Docker volumes' },
      { name: 'secrets', description: 'Docker secrets' },
      { name: 'configs', description: 'Docker configs' },
      { name: 'system', description: 'System overview and audit log' },
      { name: 'registries', description: 'Docker registry credentials' },
      { name: 'users', description: 'User management (admin only)' },
      { name: 'preferences', description: 'Current user preferences and profile' },
      { name: 'ipam', description: 'IP Address Management: sections, subnets, addresses, VLANs, VRFs, devices, locations, customers, racks, circuits, NAT, requests, custom fields, and vault' }
    ],
    paths: {
      // ─── Auth ─────────────────────────────────────────────────────────────
      '/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Log in',
          description: 'Authenticate with username and password. Sets a session cookie.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: 'admin' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Logged in — session cookie set', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Invalid credentials' }
          }
        }
      },
      '/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'Log out',
          description: 'Clear the session cookie.',
          responses: { 200: { description: 'Logged out' } }
        }
      },
      '/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Current user',
          description: 'Returns the authenticated user, or `null` if not logged in.',
          security: [],
          responses: { 200: { description: 'Current user or null', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } }
        }
      },
      '/auth/providers': {
        get: {
          tags: ['auth'],
          summary: 'Enabled auth providers',
          description: 'Returns which auth methods are enabled (used by the login page).',
          security: [],
          responses: { 200: { description: 'Provider list' } }
        }
      },

      // ─── API Tokens ───────────────────────────────────────────────────────
      '/user/tokens': {
        get: {
          tags: ['tokens'],
          summary: 'List API tokens',
          description: 'List all API tokens belonging to the current user.',
          responses: {
            200: {
              description: 'Token list (raw token values are never returned here)',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiToken' } } } }
            }
          }
        },
        post: {
          tags: ['tokens'],
          summary: 'Create API token',
          description: 'Generate a new API token. **The full token value is returned only once — save it immediately.**',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string', example: 'CI pipeline' } }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Created token including the one-time full value',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiTokenCreated' } } }
            },
            400: { description: 'name is required' }
          }
        }
      },
      '/user/tokens/{id}': {
        delete: {
          tags: ['tokens'],
          summary: 'Revoke API token',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Token revoked' },
            404: { description: 'Token not found' }
          }
        }
      },

      // ─── Nodes ────────────────────────────────────────────────────────────
      '/nodes': {
        get: {
          tags: ['nodes'],
          summary: 'List nodes',
          responses: { 200: { description: 'Node list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Node' } } } } } }
        }
      },
      '/nodes/{id}': {
        get: {
          tags: ['nodes'],
          summary: 'Get node',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Node details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } } } }
        },
        patch: {
          tags: ['nodes'],
          summary: 'Update node',
          description: 'Update availability or role. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    availability: { type: 'string', enum: ['active', 'pause', 'drain'] },
                    role: { type: 'string', enum: ['manager', 'worker'] }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Updated' }, 403: { description: 'Requires operator' } }
        },
        delete: {
          tags: ['nodes'],
          summary: 'Remove node',
          description: 'Remove node from the swarm. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' }, 403: { description: 'Requires operator' } }
        }
      },

      // ─── Services ─────────────────────────────────────────────────────────
      '/services': {
        get: {
          tags: ['services'],
          summary: 'List services',
          responses: { 200: { description: 'Service list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Service' } } } } } }
        }
      },
      '/services/{id}': {
        get: {
          tags: ['services'],
          summary: 'Get service',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Service detail' } }
        },
        delete: {
          tags: ['services'],
          summary: 'Remove service',
          description: 'Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' }, 403: { description: 'Requires operator' } }
        }
      },
      '/services/{id}/scale': {
        post: {
          tags: ['services'],
          summary: 'Scale service',
          description: 'Set replica count for a replicated service. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['replicas'], properties: { replicas: { type: 'integer', minimum: 0, example: 3 } } } } }
          },
          responses: { 200: { description: 'Scaled' }, 400: { description: 'Global services cannot be scaled' } }
        }
      },
      '/services/{id}/redeploy': {
        post: {
          tags: ['services'],
          summary: 'Force redeploy',
          description: 'Force rolling update to pull a fresh image. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Redeployed' } }
        }
      },
      '/services/{id}/image': {
        post: {
          tags: ['services'],
          summary: 'Update image',
          description: 'Update the service image tag. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', example: 'nginx:1.27-alpine' } } } } }
          },
          responses: { 200: { description: 'Image updated' } }
        }
      },
      '/services/{id}/command': {
        post: {
          tags: ['services'],
          summary: 'Update command',
          description: 'Replace the container command (CMD override). Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { command: { type: 'string', example: 'nginx -g "daemon off;"' } } } } }
          },
          responses: { 200: { description: 'Command updated' } }
        }
      },
      '/services/{id}/extra-hosts': {
        post: {
          tags: ['services'],
          summary: 'Update extra hosts',
          description: 'Replace the service\'s extra /etc/hosts entries. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['hosts'], properties: { hosts: { type: 'array', items: { type: 'string' } } } } } }
          },
          responses: { 200: { description: 'Extra hosts updated' } }
        }
      },
      '/services/{id}/environment': {
        post: {
          tags: ['services'],
          summary: 'Update environment variables',
          description: 'Replace the service\'s environment variables. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['env'], properties: { env: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } } } } } } } }
          },
          responses: { 200: { description: 'Environment updated' } }
        }
      },
      '/services/{id}/secrets': {
        post: {
          tags: ['services'],
          summary: 'Update secrets',
          description: 'Replace the service\'s attached secrets. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['secrets'], properties: { secrets: { type: 'array', items: { type: 'object', properties: { secretId: { type: 'string' }, secretName: { type: 'string' }, fileName: { type: 'string' }, uid: { type: 'string' }, gid: { type: 'string' }, mode: { type: 'integer' } } } } } } } }
          },
          responses: { 200: { description: 'Secrets updated' } }
        }
      },
      '/services/{id}/configs': {
        post: {
          tags: ['services'],
          summary: 'Update configs',
          description: 'Replace the service\'s attached configs. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['configs'], properties: { configs: { type: 'array', items: { type: 'object', properties: { configId: { type: 'string' }, configName: { type: 'string' }, fileName: { type: 'string' }, uid: { type: 'string' }, gid: { type: 'string' }, mode: { type: 'integer' } } } } } } } }
          },
          responses: { 200: { description: 'Configs updated' } }
        }
      },
      '/services/{id}/networks': {
        post: {
          tags: ['services'],
          summary: 'Update attached networks',
          description: 'Replace the networks the service\'s tasks attach to. Forces a rolling update of every task. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['networkIds'], properties: { networkIds: { type: 'array', items: { type: 'string' } } } } } }
          },
          responses: { 200: { description: 'Networks updated' } }
        }
      },
      '/services/{id}/ports': {
        post: {
          tags: ['services'],
          summary: 'Update published ports',
          description: 'Replace the service\'s published ports. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['ports'], properties: { ports: { type: 'array', items: { type: 'object', properties: { target: { type: 'integer' }, published: { type: 'integer' }, protocol: { type: 'string', enum: ['tcp', 'udp'] }, mode: { type: 'string', enum: ['ingress', 'host'] } } } } } } } }
          },
          responses: { 200: { description: 'Ports updated' } }
        }
      },
      '/services/{id}/mounts': {
        post: {
          tags: ['services'],
          summary: 'Update mounts',
          description: 'Replace the service\'s container mounts. Forces a rolling update of every task. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['mounts'], properties: { mounts: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['bind', 'volume', 'tmpfs'] }, source: { type: 'string' }, target: { type: 'string' }, readOnly: { type: 'boolean' } } } } } } } }
          },
          responses: { 200: { description: 'Mounts updated' } }
        }
      },
      '/services/{id}/resources': {
        post: {
          tags: ['services'],
          summary: 'Update resource reservations/limits',
          description: 'Replace the service\'s CPU/memory reservation and limit. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { reservation: { type: 'object', properties: { nanoCpus: { type: 'integer' }, memoryBytes: { type: 'integer' } } }, limit: { type: 'object', properties: { nanoCpus: { type: 'integer' }, memoryBytes: { type: 'integer' } } } } } } }
          },
          responses: { 200: { description: 'Resources updated' } }
        }
      },
      '/services/{id}/deployment': {
        post: {
          tags: ['services'],
          summary: 'Update deployment policy',
          description: 'Replace service labels, autoredeploy opt-in, placement constraints, restart policy, update config, and rollback config. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    labels: { type: 'object', additionalProperties: { type: 'string' } },
                    autoredeploy: { type: 'boolean' },
                    constraints: { type: 'array', items: { type: 'string' } },
                    restartPolicy: { type: 'object', properties: { condition: { type: 'string', enum: ['any', 'none', 'on-failure'] }, delay: { type: 'integer', description: 'seconds' }, window: { type: 'integer', description: 'seconds' }, maxAttempts: { type: 'integer' } } },
                    updateConfig: { type: 'object', properties: { parallelism: { type: 'integer' }, delay: { type: 'integer', description: 'seconds' }, order: { type: 'string', enum: ['stop-first', 'start-first'] }, failureAction: { type: 'string', enum: ['pause', 'continue', 'rollback'] } } },
                    rollbackConfig: { type: 'object', properties: { parallelism: { type: 'integer' }, delay: { type: 'integer', description: 'seconds' }, order: { type: 'string', enum: ['stop-first', 'start-first'] }, failureAction: { type: 'string', enum: ['pause', 'continue'] } } }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Deployment policy updated' } }
        }
      },
      '/services/{id}/log-driver': {
        post: {
          tags: ['services'],
          summary: 'Update log driver',
          description: 'Replace the service\'s logging driver and options. Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', example: 'json-file' }, options: { type: 'object', additionalProperties: { type: 'string' } } } } } }
          },
          responses: { 200: { description: 'Log driver updated' } }
        }
      },
      '/services/{id}/logs': {
        get: {
          tags: ['services'],
          summary: 'Service logs',
          description: 'Fetch recent logs (plain text).',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'tail', in: 'query', schema: { type: 'integer', default: 200 } }
          ],
          responses: { 200: { description: 'Log lines', content: { 'text/plain': { schema: { type: 'string' } } } } }
        }
      },

      // ─── Stacks ───────────────────────────────────────────────────────────
      '/stacks': {
        get: {
          tags: ['stacks'],
          summary: 'List stacks',
          responses: { 200: { description: 'Stack list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Stack' } } } } } }
        },
        post: {
          tags: ['stacks'],
          summary: 'Deploy stack',
          description: 'Create or update a stack from a compose file. Requires `operator`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'compose'],
                  properties: {
                    name: { type: 'string', example: 'myapp' },
                    compose: { type: 'string', example: 'version: "3.8"\nservices:\n  web:\n    image: nginx' },
                    message: { type: 'string', example: 'Deploy v1.2.3', description: 'GitLab commit message' },
                    commit: { type: 'boolean', default: true, description: 'Commit to GitLab (if enabled)' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Deployed' }, 400: { description: 'name and compose are required' } }
        }
      },
      '/stacks/{name}': {
        get: {
          tags: ['stacks'],
          summary: 'Get stack',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Stack detail with compose YAML and services' } }
        },
        delete: {
          tags: ['stacks'],
          summary: 'Remove stack',
          description: 'Remove all services in a stack. Requires `operator`.',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },
      '/stacks/{name}/rollback': {
        post: {
          tags: ['stacks'],
          summary: 'Rollback stack',
          description: 'Redeploy a previous GitLab commit for this stack. Requires `operator`.',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['sha'], properties: { sha: { type: 'string', example: 'abc1234' } } } } }
          },
          responses: { 200: { description: 'Rolled back' } }
        }
      },

      // ─── Tasks ────────────────────────────────────────────────────────────
      '/tasks': {
        get: {
          tags: ['tasks'],
          summary: 'List tasks',
          description: 'All service tasks across the swarm.',
          responses: { 200: { description: 'Task list' } }
        }
      },

      // ─── Containers ───────────────────────────────────────────────────────
      '/containers': {
        get: {
          tags: ['containers'],
          summary: 'List containers',
          responses: { 200: { description: 'Container list' } }
        }
      },
      '/containers/{id}': {
        delete: {
          tags: ['containers'],
          summary: 'Remove container',
          description: 'Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },
      '/containers/{id}/logs': {
        get: {
          tags: ['containers'],
          summary: 'Container logs',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'tail', in: 'query', schema: { type: 'integer', default: 200 } }
          ],
          responses: { 200: { description: 'Log lines', content: { 'text/plain': { schema: { type: 'string' } } } } }
        }
      },

      // ─── Networks ─────────────────────────────────────────────────────────
      '/networks': {
        get: {
          tags: ['networks'],
          summary: 'List networks',
          responses: { 200: { description: 'Network list' } }
        },
        post: {
          tags: ['networks'],
          summary: 'Create network',
          description: 'Requires `operator`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    driver: { type: 'string', example: 'overlay' },
                    attachable: { type: 'boolean' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Created' } }
        }
      },
      '/networks/{id}': {
        delete: {
          tags: ['networks'],
          summary: 'Remove network',
          description: 'Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },

      // ─── Volumes ──────────────────────────────────────────────────────────
      '/volumes': {
        get: {
          tags: ['volumes'],
          summary: 'List volumes',
          responses: { 200: { description: 'Volume list' } }
        },
        post: {
          tags: ['volumes'],
          summary: 'Create volume',
          description: 'Requires `operator`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' }, driver: { type: 'string', example: 'local' } }
                }
              }
            }
          },
          responses: { 200: { description: 'Created' } }
        }
      },
      '/volumes/{name}': {
        delete: {
          tags: ['volumes'],
          summary: 'Remove volume',
          description: 'Requires `operator`.',
          parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },

      // ─── Secrets ──────────────────────────────────────────────────────────
      '/secrets': {
        get: {
          tags: ['secrets'],
          summary: 'List secrets',
          responses: { 200: { description: 'Secret list (no values)' } }
        },
        post: {
          tags: ['secrets'],
          summary: 'Create secret',
          description: 'Requires `operator`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'data'],
                  properties: { name: { type: 'string' }, data: { type: 'string', description: 'Secret value (plain text)' } }
                }
              }
            }
          },
          responses: { 200: { description: 'Created' } }
        }
      },
      '/secrets/{id}': {
        delete: {
          tags: ['secrets'],
          summary: 'Remove secret',
          description: 'Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },

      // ─── Configs ──────────────────────────────────────────────────────────
      '/configs': {
        get: {
          tags: ['configs'],
          summary: 'List configs',
          responses: { 200: { description: 'Config list' } }
        },
        post: {
          tags: ['configs'],
          summary: 'Create config',
          description: 'Requires `operator`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'data'],
                  properties: { name: { type: 'string' }, data: { type: 'string', description: 'Config content (plain text or base64)' } }
                }
              }
            }
          },
          responses: { 200: { description: 'Created' } }
        }
      },
      '/configs/{id}': {
        get: {
          tags: ['configs'],
          summary: 'Get config',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Config with data' } }
        },
        delete: {
          tags: ['configs'],
          summary: 'Remove config',
          description: 'Requires `operator`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },

      // ─── System ───────────────────────────────────────────────────────────
      '/system/overview': {
        get: {
          tags: ['system'],
          summary: 'Cluster overview',
          description: 'Node count, service count, CPU/memory totals.',
          responses: { 200: { description: 'Overview stats' } }
        }
      },
      '/system/audit': {
        get: {
          tags: ['system'],
          summary: 'Audit log',
          description: 'Last 200 audit entries. Requires `admin`.',
          responses: { 200: { description: 'Audit entries', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } } } } } }
        }
      },

      // ─── Registries ───────────────────────────────────────────────────────
      '/registries': {
        get: {
          tags: ['registries'],
          summary: 'List registries',
          description: 'Requires `admin`.',
          responses: { 200: { description: 'Registry list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Registry' } } } } } }
        },
        post: {
          tags: ['registries'],
          summary: 'Add registry',
          description: 'Requires `admin`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'url', 'username'],
                  properties: {
                    name: { type: 'string', example: 'ghcr.io' },
                    url: { type: 'string', example: 'https://ghcr.io' },
                    username: { type: 'string' },
                    password: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Registry' } } } } }
        }
      },
      '/registries/{id}': {
        delete: {
          tags: ['registries'],
          summary: 'Remove registry',
          description: 'Requires `admin`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Removed' } }
        }
      },

      // ─── Users ────────────────────────────────────────────────────────────
      '/users': {
        get: {
          tags: ['users'],
          summary: 'List users',
          description: 'Requires `admin`.',
          responses: { 200: { description: 'User list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } }
        },
        post: {
          tags: ['users'],
          summary: 'Create user',
          description: 'Create a local user. Requires `admin`.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password', 'role'],
                  properties: {
                    username: { type: 'string' },
                    displayName: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string', enum: ['viewer', 'operator', 'manager', 'admin'] },
                    password: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Created user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, 409: { description: 'Username already exists' } }
        }
      },
      '/users/{id}': {
        patch: {
          tags: ['users'],
          summary: 'Update user',
          description: 'Update role, display name, email, or password. Requires `admin`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['viewer', 'operator', 'manager', 'admin'] },
                    displayName: { type: 'string' },
                    email: { type: 'string' },
                    password: { type: 'string', description: 'Local accounts only' }
                  }
                }
              }
            }
          },
          responses: { 200: { description: 'Updated user' } }
        },
        delete: {
          tags: ['users'],
          summary: 'Delete user',
          description: 'Requires `admin`.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Deleted' } }
        }
      },

      // ─── Preferences ──────────────────────────────────────────────────────
      '/user/preferences': {
        get: {
          tags: ['preferences'],
          summary: 'Get preferences',
          description: 'Current user\'s display preferences.',
          responses: { 200: { description: 'Preferences', content: { 'application/json': { schema: { $ref: '#/components/schemas/Preferences' } } } } }
        },
        patch: {
          tags: ['preferences'],
          summary: 'Update preferences',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Preferences' } } }
          },
          responses: { 200: { description: 'Updated preferences' } }
        }
      },

      // ─── IPAM: Sections ─────────────────────────────────────────────────────
      '/ipmgt/sections': {
        get: { tags: ['ipam'], summary: 'List sections', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Section list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamSection' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create section', description: 'Requires ipmgt `operator`.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, parent_id: { type: 'string', nullable: true }, strict_mode: { type: 'boolean' } } } } } }, responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/sections/{id}': {
        put: { tags: ['ipam'], summary: 'Update section', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete section', description: 'Requires ipmgt `admin`. Blocked (409) if it still holds subnets unless `?force=true`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'force', in: 'query', schema: { type: 'boolean' } }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Still holds subnets' } } }
      },

      // ─── IPAM: Subnets ──────────────────────────────────────────────────────
      '/ipmgt/subnets': {
        get: { tags: ['ipam'], summary: 'List subnets', description: 'Requires ipmgt `viewer`. Filters: `section_id`, `vrf_id`, `version` (4|6), `q`.', parameters: [{ name: 'section_id', in: 'query', schema: { type: 'string' } }, { name: 'vrf_id', in: 'query', schema: { type: 'string' } }, { name: 'version', in: 'query', schema: { type: 'integer' } }, { name: 'q', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Subnet list with live usage', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamSubnet' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create subnet', description: 'Requires ipmgt `operator`. Validates the CIDR and rejects overlap within the same section/VRF.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['network'], properties: { network: { type: 'string', example: '10.0.1.0/24' }, name: { type: 'string' }, section_id: { type: 'string', nullable: true }, vrf_id: { type: 'string', nullable: true }, location_id: { type: 'string', nullable: true }, customer_id: { type: 'string', nullable: true }, gateway: { type: 'string' }, allow_requests: { type: 'boolean' }, scan_enabled: { type: 'boolean' }, ping_enabled: { type: 'boolean' } } } } } }, responses: { 200: { description: 'Created' }, 409: { description: 'Overlaps an existing subnet' } } }
      },
      '/ipmgt/subnets/{id}': {
        get: { tags: ['ipam'], summary: 'Subnet detail', description: 'Requires ipmgt `viewer`. Includes computed CIDR facts, usage, and child subnets.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Subnet detail' } } },
        put: { tags: ['ipam'], summary: 'Update subnet', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete subnet', description: 'Requires ipmgt `admin`. Blocked (409) if it holds addresses or child subnets unless `?force=true`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'force', in: 'query', schema: { type: 'boolean' } }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Still in use' } } }
      },
      '/ipmgt/subnets/{id}/ips': { get: { tags: ['ipam'], summary: 'Subnet address grid', description: 'Requires ipmgt `viewer`. Capped visual grid of host cells for manageable subnet sizes.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Grid cells' } } } },
      '/ipmgt/subnets/{id}/first-free': { get: { tags: ['ipam'], summary: 'Find first free address', description: 'Requires ipmgt `viewer`. Does not reserve it.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'First free IP' }, 409: { description: 'No free addresses' } } } },
      '/ipmgt/subnets/{id}/reserve': { post: { tags: ['ipam'], summary: 'Reserve first free address', description: 'Requires ipmgt `operator`. Concurrency-safe (per-subnet advisory lock) - two simultaneous calls never get the same address.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Reserved' }, 409: { description: 'No free addresses' } } } },
      '/ipmgt/subnets/{id}/scan': { post: { tags: ['ipam'], summary: 'Run a scan now', description: 'Requires ipmgt `operator`. Runs host-status refresh and/or new-host discovery immediately, regardless of the scheduled interval. Requires `ping_enabled` or `scan_enabled` on the subnet.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Scan report: hostsScanned/hostsUp/newHosts' }, 409: { description: 'Neither ping nor scan enabled' } } } },

      // ─── IPAM: Addresses ────────────────────────────────────────────────────
      '/ipmgt/addresses': {
        get: { tags: ['ipam'], summary: 'List addresses', description: 'Requires ipmgt `viewer`. Filters: `subnet_id`, `status`, `q`.', parameters: [{ name: 'subnet_id', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 5000 } }], responses: { 200: { description: 'Address list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamAddress' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create address', description: 'Requires ipmgt `operator`. Validates the IP is inside the subnet and not a duplicate.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subnet_id', 'ip'], properties: { subnet_id: { type: 'string' }, ip: { type: 'string' }, hostname: { type: 'string' }, mac: { type: 'string' }, status: { type: 'string', enum: ['used', 'reserved', 'dhcp', 'offline', 'deprecated', 'gateway'] }, customer_id: { type: 'string', nullable: true }, device_id: { type: 'string', nullable: true } } } } } }, responses: { 200: { description: 'Created' }, 409: { description: 'Duplicate address' } } }
      },
      '/ipmgt/addresses/{id}': {
        get: { tags: ['ipam'], summary: 'Address detail', description: 'Requires ipmgt `viewer`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Address' } } },
        put: { tags: ['ipam'], summary: 'Update address', description: 'Requires ipmgt `operator`. Status transitions are recorded in the address history.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Release address', description: 'Requires ipmgt `operator`. Frees the address (free addresses are not stored as rows).', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Released' } } }
      },
      '/ipmgt/addresses/{id}/history': { get: { tags: ['ipam'], summary: 'Address change history', description: 'Requires ipmgt `viewer`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'History entries' } } } },

      // ─── IPAM: VLANs, L2 domains, VRFs ──────────────────────────────────────
      '/ipmgt/vlans': {
        get: { tags: ['ipam'], summary: 'List VLANs', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'VLAN list' } } },
        post: { tags: ['ipam'], summary: 'Create VLAN', description: 'Requires ipmgt `operator`. `vlan_id` (1-4094) must be unique within its L2 domain.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['vlan_id', 'name'], properties: { vlan_id: { type: 'integer', minimum: 1, maximum: 4094 }, name: { type: 'string' }, l2domain_id: { type: 'string', nullable: true } } } } } }, responses: { 200: { description: 'Created' }, 409: { description: 'VLAN id already exists in this domain' } } }
      },
      '/ipmgt/vlans/{id}': {
        put: { tags: ['ipam'], summary: 'Update VLAN', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete VLAN', description: 'Requires ipmgt `admin`. Referencing subnets are detached, not deleted.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      },
      '/ipmgt/l2domains': {
        get: { tags: ['ipam'], summary: 'List L2 domains', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'L2 domain list' } } },
        post: { tags: ['ipam'], summary: 'Create L2 domain', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/vrfs': {
        get: { tags: ['ipam'], summary: 'List VRFs', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'VRF list' } } },
        post: { tags: ['ipam'], summary: 'Create VRF', description: 'Requires ipmgt `operator`. Subnets in different VRFs may overlap by design.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/vrfs/{id}': {
        put: { tags: ['ipam'], summary: 'Update VRF', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete VRF', description: 'Requires ipmgt `admin`. Referencing subnets are detached, not deleted.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      },

      // ─── IPAM: Devices ──────────────────────────────────────────────────────
      '/ipmgt/devices': {
        get: { tags: ['ipam'], summary: 'List devices', description: 'Requires ipmgt `viewer`. Filters: `device_type`, `status`, `location_id`, `customer_id`, `q`. SNMP secrets are never included - only `snmp_*_set` booleans.', responses: { 200: { description: 'Device list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamDevice' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create device', description: 'Requires ipmgt `operator`. Any posted SNMP secret is encrypted at rest and never echoed back.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['hostname'], properties: { hostname: { type: 'string' }, device_type: { type: 'string' }, management_ip: { type: 'string' }, location_id: { type: 'string', nullable: true }, customer_id: { type: 'string', nullable: true }, snmp_version: { type: 'string', enum: ['v1', 'v2c', 'v3'] }, snmp_community: { type: 'string', writeOnly: true } } } } } }, responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/devices/{id}': {
        put: { tags: ['ipam'], summary: 'Update device', description: 'Requires ipmgt `operator`. A blank SNMP secret field keeps the currently-stored value.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete device', description: 'Requires ipmgt `admin` + password confirmation (`x-confirm-password` header). Blocked (409) if any address still references it.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Still referenced' }, 428: { description: 'Password confirmation required' } } }
      },
      '/ipmgt/devices/{id}/snmp-test': { post: { tags: ['ipam'], summary: 'Test SNMP connectivity', description: 'Requires ipmgt `operator`. Decrypts the device\'s stored credentials just-in-time; never returns them.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'sysName/sysDescr/uptime' }, 502: { description: 'No response or invalid credentials' } } } },
      '/ipmgt/devices/{id}/snmp-discover': { post: { tags: ['ipam'], summary: 'SNMP ARP-table discovery', description: 'Requires ipmgt `operator`. Walks the device\'s ARP table and records IP/MAC pairs that fall inside a known subnet.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'entries/matched/created/updated counts' }, 502: { description: 'SNMP walk failed' } } } },

      // ─── IPAM: Locations, Customers ─────────────────────────────────────────
      '/ipmgt/locations': {
        get: { tags: ['ipam'], summary: 'List locations', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Location list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamLocation' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create location', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/locations/{id}': {
        put: { tags: ['ipam'], summary: 'Update location', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete location', description: 'Requires ipmgt `admin` + password confirmation. Blocked (409, listing referencing records) if still in use.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Still in use' }, 428: { description: 'Password confirmation required' } } }
      },
      '/ipmgt/customers': {
        get: { tags: ['ipam'], summary: 'List customers', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Customer list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamCustomer' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create customer', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/customers/{id}': {
        put: { tags: ['ipam'], summary: 'Update customer', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete customer', description: 'Requires ipmgt `admin` + password confirmation. Blocked (409, listing referencing records) if still in use.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 409: { description: 'Still in use' }, 428: { description: 'Password confirmation required' } } }
      },

      // ─── IPAM: Racks, Circuits, NAT ─────────────────────────────────────────
      '/ipmgt/racks': {
        get: { tags: ['ipam'], summary: 'List racks', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Rack list' } } },
        post: { tags: ['ipam'], summary: 'Create rack', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/racks/{id}': {
        get: { tags: ['ipam'], summary: 'Rack detail', description: 'Requires ipmgt `viewer`. Includes every placed item.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Rack + items' } } },
        put: { tags: ['ipam'], summary: 'Update rack', description: 'Requires ipmgt `operator`. Cannot shrink below already-placed items.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete rack', description: 'Requires ipmgt `admin` + password confirmation. Placed items are removed with it.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 428: { description: 'Password confirmation required' } } }
      },
      '/ipmgt/racks/{id}/items': { post: { tags: ['ipam'], summary: 'Place a rack item', description: 'Requires ipmgt `operator`. Validated against rack bounds and existing items on the same face (409 on overlap/overflow).', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Placed' }, 409: { description: 'Overlap or out of bounds' } } } },
      '/ipmgt/racks/{id}/items/{itemId}': {
        put: { tags: ['ipam'], summary: 'Update a rack item', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' }, 409: { description: 'Overlap or out of bounds' } } },
        delete: { tags: ['ipam'], summary: 'Remove a rack item', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Removed' } } }
      },
      '/ipmgt/circuit-providers': {
        get: { tags: ['ipam'], summary: 'List circuit providers', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Provider list' } } },
        post: { tags: ['ipam'], summary: 'Create circuit provider', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/circuits': {
        get: { tags: ['ipam'], summary: 'List circuits', description: 'Requires ipmgt `viewer`. Filters: `status`, `customer_id`.', responses: { 200: { description: 'Circuit list' } } },
        post: { tags: ['ipam'], summary: 'Create circuit', description: 'Requires ipmgt `operator`.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/circuits/{id}': {
        put: { tags: ['ipam'], summary: 'Update circuit', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete circuit', description: 'Requires ipmgt `admin`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      },
      '/ipmgt/nat': {
        get: { tags: ['ipam'], summary: 'List NAT rules', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'NAT rule list' } } },
        post: { tags: ['ipam'], summary: 'Create NAT rule', description: 'Requires ipmgt `operator`. Exactly one of `source_ip_id`/`source_subnet_id`/`source_text` must be set.', responses: { 200: { description: 'Created' }, 400: { description: 'Zero or multiple sources specified' } } }
      },
      '/ipmgt/nat/{id}': {
        put: { tags: ['ipam'], summary: 'Update NAT rule', description: 'Requires ipmgt `operator`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete NAT rule', description: 'Requires ipmgt `admin`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' } } }
      },

      // ─── IPAM: IP requests ──────────────────────────────────────────────────
      '/ipmgt/requests': {
        get: { tags: ['ipam'], summary: 'List IP requests', description: 'Requires ipmgt `viewer`. Filters: `status`, `subnet_id`, `mine=true`.', responses: { 200: { description: 'Request list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamRequest' } } } } } } },
        post: { tags: ['ipam'], summary: 'Submit an IP request', description: 'Requires ipmgt `operator`. Target subnet must have `allow_requests = true`.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subnet_id'], properties: { subnet_id: { type: 'string' }, requested_ip: { type: 'string', nullable: true, description: 'Blank = auto-allocate first-free on approval' }, hostname: { type: 'string' }, justification: { type: 'string' } } } } } }, responses: { 200: { description: 'Submitted' }, 403: { description: 'Subnet does not accept requests' } } }
      },
      '/ipmgt/requests/{id}/approve': { post: { tags: ['ipam'], summary: 'Approve a request', description: 'Requires ipmgt `manager`. Atomically allocates the address (concurrency-safe) and creates the address record.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Approved + address allocated' }, 409: { description: 'Already decided, or address unavailable' } } } },
      '/ipmgt/requests/{id}/reject': { post: { tags: ['ipam'], summary: 'Reject a request', description: 'Requires ipmgt `manager`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Rejected' } } } },
      '/ipmgt/requests/{id}/cancel': { post: { tags: ['ipam'], summary: 'Cancel a request', description: 'Requires ipmgt `operator`; only the original requester or an ipmgt admin may cancel.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Cancelled' }, 403: { description: 'Not the requester or an admin' } } } },

      // ─── IPAM: Custom fields ────────────────────────────────────────────────
      '/ipmgt/customfields/defs': {
        get: { tags: ['ipam'], summary: 'List custom field definitions', description: 'Requires ipmgt `viewer`. Filter: `entity_type`.', responses: { 200: { description: 'Definition list' } } },
        post: { tags: ['ipam'], summary: 'Create custom field definition', description: 'Requires ipmgt `admin` (module configuration).', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/customfields/defs/{id}': {
        put: { tags: ['ipam'], summary: 'Update custom field definition', description: 'Requires ipmgt `admin`.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete custom field definition', description: 'Requires ipmgt `admin` + password confirmation. Cascades to every stored value for this field.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 428: { description: 'Password confirmation required' } } }
      },
      '/ipmgt/customfields/values': {
        get: { tags: ['ipam'], summary: 'Get definitions + values for an entity', description: 'Requires ipmgt `viewer`. Query: `entity_type` (required), `entity_id` (omit for create-mode defaults).', parameters: [{ name: 'entity_type', in: 'query', required: true, schema: { type: 'string' } }, { name: 'entity_id', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'defs + values' } } },
        put: { tags: ['ipam'], summary: 'Bulk-save custom field values for an entity', description: 'Requires ipmgt `operator`. Validates each value (type, required, uniqueness) before writing any of them.', responses: { 200: { description: 'Saved' }, 400: { description: 'Validation failure' }, 409: { description: 'Unique-value conflict' } } }
      },

      // ─── IPAM: Vault ────────────────────────────────────────────────────────
      '/ipmgt/vault': {
        get: { tags: ['ipam'], summary: 'List vault item metadata', description: 'Requires ipmgt `manager`. Never includes the secret value in any form.', responses: { 200: { description: 'Metadata list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/IpamVaultItemMeta' } } } } } } },
        post: { tags: ['ipam'], summary: 'Create vault item', description: 'Requires ipmgt `manager`. The value is encrypted at rest and never echoed back.', responses: { 200: { description: 'Created' } } }
      },
      '/ipmgt/vault/{id}': {
        put: { tags: ['ipam'], summary: 'Update vault item', description: 'Requires ipmgt `manager`. A blank `value` keeps the currently-stored secret.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated' } } },
        delete: { tags: ['ipam'], summary: 'Delete vault item', description: 'Requires ipmgt `admin` + password confirmation.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Deleted' }, 428: { description: 'Password confirmation required' } } }
      },
      '/ipmgt/vault/{id}/reveal': { post: { tags: ['ipam'], summary: 'Reveal a vault item\'s secret', description: 'Requires ipmgt `admin` **and** a fresh password confirmation (`x-confirm-password` header) - re-authorization, not just an existing session. Every reveal is audited.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'The decrypted value, shown once' }, 428: { description: 'Password confirmation required' } } } },
      '/ipmgt/vault/{id}/access-log': { get: { tags: ['ipam'], summary: 'Vault item access log', description: 'Requires ipmgt `manager`. Who revealed this item, and when.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Access log entries' } } } },

      // ─── IPAM: Search, dashboard, scans, import/export ─────────────────────
      '/ipmgt/search': { get: { tags: ['ipam'], summary: 'Global IPAM search', description: 'Requires ipmgt `viewer`. Exact/partial IP, hostname/MAC/device/owner text, or CIDR containment - across addresses, subnets, VLANs, VRFs, sections, devices, locations, and customers.', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Grouped results' } } } },
      '/ipmgt/dashboard': { get: { tags: ['ipam'], summary: 'IPAM dashboard summary', description: 'Requires ipmgt `viewer`. Entity counts, IPv4/IPv6 capacity, status breakdown, high-usage subnets, pending requests, recent activity.', responses: { 200: { description: 'Dashboard payload' } } } },
      '/ipmgt/scans': { get: { tags: ['ipam'], summary: 'Scan run history', description: 'Requires ipmgt `viewer`. Filter: `subnet_id`.', parameters: [{ name: 'subnet_id', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } }], responses: { 200: { description: 'History entries' } } } },
      '/ipmgt/export': { get: { tags: ['ipam'], summary: 'Bulk export', description: 'Requires ipmgt `viewer` (`ipmgt.export`). Query: `entity_type` (section|subnet|address|vlan|vrf|device|location|customer). Device exports never include SNMP credentials.', parameters: [{ name: 'entity_type', in: 'query', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'JSON rows' } } } },
      '/ipmgt/import': { post: { tags: ['ipam'], summary: 'Bulk import', description: 'Requires ipmgt `operator` (`ipmgt.import`). Same columns as export; rows are processed one at a time with per-row error collection.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['entity_type', 'content'], properties: { entity_type: { type: 'string' }, format: { type: 'string', enum: ['json', 'csv'] }, content: { type: 'string' }, mode: { type: 'string', enum: ['skip', 'update'] } } } } } }, responses: { 200: { description: 'created/updated/skipped/errors report' } } } },
      '/ipmgt/calculator': { get: { tags: ['ipam'], summary: 'Subnet calculator', description: 'Requires ipmgt `viewer`. IPv4/v6 CIDR facts and split-into-children.', responses: { 200: { description: 'Calculator result' } } } },
      '/ipmgt/settings': {
        get: { tags: ['ipam'], summary: 'Get IPAM module settings', description: 'Requires ipmgt `viewer`.', responses: { 200: { description: 'Settings' } } },
        put: { tags: ['ipam'], summary: 'Update IPAM module settings', description: 'Requires ipmgt `admin`.', responses: { 200: { description: 'Updated' } } }
      }
    }
  }
}
