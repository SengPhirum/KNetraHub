# Monitoring

LibreNMS-equivalent monitoring platform for KNetraHub. One unified device
model (routers, switches, firewalls, servers, hypervisors, printers,
wireless controllers, storage, UPS and environmental systems are all
"devices" with discovered capabilities); registry-driven discovery and
polling engines; a durable DB-backed job queue; structured alerting with
pluggable transports; SNMP trap and syslog receivers; active service checks;
traffic billing; and a Data Collection page that makes collection
completeness auditable end to end.

Full documentation: [`docs/monitoring/`](../../docs/monitoring/) at the repo
root — architecture, database schema, module guides, API guide, CLI guide,
troubleshooting, and the LibreNMS feature-parity matrices.

- Clean-room implementation — see
  [`docs/monitoring/librenms-upstream-parity-snapshot.md`](../../docs/monitoring/librenms-upstream-parity-snapshot.md)
  for the upstream review this targets, and the licensing note there.
- Legacy Zabbix-style Network/Server module removal record:
  [`docs/monitoring/legacy-monitoring-removal-report.md`](../../docs/monitoring/legacy-monitoring-removal-report.md).

## Layout

```text
app/            UI: pages under /monitoring, shared components/composables
server/
  api/monitoring/v1/   versioned REST API
  db/                  schema migrations (TS-embedded SQL) + runner
  snmp/                SNMP v1/v2c/v3 engine (net-snmp wrapper)
  core/                registries, counter math, reconciliation, credentials
  definitions/os/      declarative OS detection definitions
  discovery/           discovery engine + modules
  polling/             polling engine + modules
  alerting/            condition evaluator, templates, transports
  services/            active service checks (ICMP/TCP/HTTP/DNS/cert/...)
  receivers/           SNMP trap + syslog receivers
  jobs/                durable queue, dispatcher, housekeeping
  billing/             traffic billing (quota + 95th percentile)
  plugins/             Nitro bootstrap
shared/         types/constants shared client+server
tests/unit/     vitest tests for pure logic (counters, conditions, syslog)
```

## Local development

```bash
pnpm dev                       # portal + Monitoring UI at /monitoring
NUXT_MONITORING_TRAP_ENABLED=true NUXT_MONITORING_SYSLOG_ENABLED=true pnpm dev
```

No demo/simulated data is seeded — add a real device (Devices → Add) or run
Discovery against a real CIDR. Fixtures for automated tests live under
`tests/` only.
