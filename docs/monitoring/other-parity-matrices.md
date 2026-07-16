# Trap Handlers / Alert Transports / API Endpoints / Dashboard Widgets / Integrations / OS Definitions

Remaining registry sub-matrices, grouped here for brevity.

## Trap handlers (`server/receivers/traps.ts`)

| Handler | Trap OID | Status |
|---|---|---|
| linkDown | `1.3.6.1.6.3.1.1.5.3` | **Complete** — updates port oper_status, raises `port_down` event |
| linkUp | `1.3.6.1.6.3.1.1.5.4` | **Complete** — updates port oper_status, raises `port_up` event |
| coldStart / warmStart | `1.3.6.1.6.3.1.1.5.1` / `.2` | **Complete** — sets `last_reboot_at`, raises `device_rebooted` event |
| authenticationFailure | `1.3.6.1.6.3.1.1.5.5` | **Complete** — raises `snmp_auth_failure` event |
| Vendor enterprise traps (Cisco/Juniper/etc.) | vendor-specific | **Blocked** — the registry supports adding these (`module-guides.md`); none shipped |
| Unknown-trap fallback | any unmatched | **Complete** — logged as event unless `traps.unknown = 'ignore'` |

## Alert transports (`server/alerting/transports.ts`)

| Transport | Status |
|---|---|
| Generic webhook | **Complete** |
| Slack | **Complete** |
| Discord | **Complete** |
| Telegram | **Complete** |
| Microsoft Teams | **Complete** |
| Mattermost | **Complete** |
| Rocket.Chat | **Complete** |
| Gotify | **Complete** |
| ntfy | **Complete** |
| Pushover | **Complete** |
| PagerDuty | **Complete** |
| Opsgenie | **Complete** |
| Email (SMTP) | **Complete** (minimal AUTH LOGIN client, no attachments) |
| Signal-compatible gateway | **Blocked** |
| SMS gateway / Twilio | **Blocked** |
| VictorOps/Splunk On-Call | **Blocked** |
| Matrix | **Blocked** |
| XMPP | **Blocked** |
| ServiceNow | **Blocked** |
| Jira | **Blocked** |
| GitHub issue | **Blocked** |
| GitLab issue | **Blocked** |
| Kafka | **Blocked** |
| MQTT | **Blocked** |
| Syslog (outbound) | **Blocked** |
| Nagios-compatible command | **Blocked** (no shell-exec transport by design) |
| Pushbullet | **Blocked** |
| Google Chat | **Blocked** |
| Custom HTTP API | **Complete** (this is what the generic `webhook` transport is) |

## API endpoint categories

See [`api.md`](./api.md) for the full endpoint index. Category coverage vs.
the mandate's required list:

| Category | Status |
|---|---|
| Devices | **Complete** |
| Device groups | **Complete** (read + evaluation; create/edit via direct DB today, no dedicated write endpoint) |
| Discovery | **Complete** (scan + per-device trigger) |
| Inventory | **Complete** |
| Locations | **Complete** (read; write via direct DB) |
| Ports | **Complete** |
| Sensors | **Complete** |
| Applications | **Complete** (list; no collector data to list yet — see applications-parity.md) |
| Services | **Complete** (read; write via direct DB) |
| Routing | **Complete** (BGP/OSPF) |
| Switching | **Complete** (VLAN/FDB/ARP/neighbors) |
| Wireless | **Complete** (list; empty until a wireless module ships) |
| Alerts | **Complete** |
| Alert rules | **Complete** |
| Alert templates | **Partially complete** (read only) |
| Alert transports | **Complete** |
| Bills | **Partially complete** (read only) |
| Dashboards | **Blocked** |
| Logs (event/syslog/traps/alert) | **Complete** |
| Pollers / poller groups | **Complete** |
| Port groups | **Blocked** — no port-group concept implemented |
| Port security (802.1X) | **Blocked** |
| System status | **Complete** |
| Data quality | **Complete** |
| ARP | **Complete** (under switching) |

## Dashboard widgets

**Blocked overall** — no widget-canvas framework exists (see
`feature-parity.md` §12). The Overview page hardcodes equivalent summary
data instead of a configurable widget grid.

## External integrations

| Integration | Status |
|---|---|
| Oxidized / RANCID / Unimus (config backup) | **Blocked** |
| NetFlow / sFlow / IPFIX | **Blocked** |
| SmokePing | **Blocked** |
| collectd / Graphite / InfluxDB / OpenTSDB / Prometheus / Kafka export | **Blocked** |
| Graylog (syslog forwarding) | **Blocked** |
| PeeringDB | **Blocked** |
| Proxmox | **Blocked** |
| Check_MK-compatible agent | **Blocked** |
| Nagios plugins | **Blocked** (native checks only, see feature-parity §8) |

## Supported OS definitions

See `layers/monitoring/server/definitions/os/index.ts`. Currently defined:
`generic`, `ping`, `linux`, `windows`, `freebsd`, `ios`, `iosxe`, `nxos`,
`junos`, `arista-eos`, `routeros`, `fortigate`, `panos`, `procurve`,
`arubaos`, `dsm`, `vmware-esxi`, `apc-ups`, `printer`, `opnsense`, `pfsense`
— 20 definitions. LibreNMS ships ~200+ OS YAML definitions; this is
**Partially complete** by design (the registry architecture supports adding
any number of definitions with a single `defineOs()` call — see
`module-guides.md` — the count reflects initial coverage, not an
architectural limit).
