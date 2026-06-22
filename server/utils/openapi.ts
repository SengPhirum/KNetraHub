export function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'DockHub API',
      version: '1.0.0',
      description: [
        'REST API for DockHub — Docker Swarm management console.',
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
    servers: [{ url: '/api', description: 'DockHub API' }],
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
            role: { type: 'string', enum: ['viewer', 'operator', 'admin'] },
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
      { name: 'preferences', description: 'Current user preferences and profile' }
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
                    role: { type: 'string', enum: ['viewer', 'operator', 'admin'] },
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
                    role: { type: 'string', enum: ['viewer', 'operator', 'admin'] },
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
      }
    }
  }
}
