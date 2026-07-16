# LibreNMS Upstream Parity Snapshot

This records the upstream review that anchors the KNetraHub Monitoring
rebuild's parity targets. The rebuild is a **clean-room implementation**: it
targets functional/workflow/module/data-collection parity based on documented
LibreNMS behaviour, public MIBs, and open protocol standards. **No LibreNMS
(GPLv3) source code was copied into this MIT-licensed codebase.** KNetraHub
branding and the existing KNetraHub design system are used throughout; no
LibreNMS name, logo, or artwork is reused, and no affiliation is claimed or
implied.

| Field | Value |
|---|---|
| Review date | 2026-07-16 |
| Upstream repository | `github.com/librenms/librenms` |
| Upstream branch reviewed | `master` |
| Upstream commit SHA | `0dd0b575db6569e61687cebc1545e043d02f6cf4` (2026-07-15) |
| Latest upstream release at review | `26.6.1` (2026-06-17) |
| Documentation | `docs.librenms.org` (rolling docs for the 26.x line) |

## Feature areas reviewed

Behavioural reference was taken from the official documentation and public
definitions for the following areas (documented behaviour only — see the
clean-room note above):

- **Device lifecycle** — add-device flows (SNMP v1/v2c/v3, ICMP-only,
  force-add, poller group, port-association modes), device dependencies,
  maintenance, ignore/disable semantics.
- **Discovery modules** (~40): core/OS detection, ports, port-stack, entity
  physical/state, processors, mempools, storage, hr-device, sensors,
  ipv4/ipv6 addresses, ARP, VLANs, FDB, discovery protocols (LLDP/CDP/FDP),
  BGP, OSPF/OSPFv3, VRF, MPLS, SLA, STP, wireless, printer supplies, UCD
  disk I/O, applications, services, route tables, NAC, xDSL, load balancers.
- **Poller modules** (~45): the polling counterparts of the above plus
  availability, IPMI, unix-agent, netstats, IP-SLA, CBQoS, IPSec/VPN, VM info,
  NTP, MEF.
- **Health sensor classes** (~31): airflow…waterflow list per the sensors
  documentation, including divisor/multiplier, warn/crit low/high limits,
  state translations, and per-OS YAML sensor definition structure.
- **Wireless sensor classes** (~22): ap-count, clients, ccq, snr, rssi,
  rsrp/rsrq/sinr, noise floor, tx power, utilization, etc.
- **Database concepts**: `devices`, `ports`, `sensors`, `processors`,
  `mempools`, `storage`, `entPhysical`, `bgpPeers`, `ospf_*`, `vlans`,
  `ipv4/ipv6_*`, `alert_rules`/`alerts`/`alert_transports`/`alert_templates`,
  `eventlog`, `syslog`, `services`, `applications`, `bills`, `locations`,
  `device_groups`, `poller_groups` — used as the *conceptual* target for the
  new normalized `monitoring` schema (not copied structurally).
- **Alerting**: rule builder semantics, macros, delay/interval/max, ack &
  sticky ack, recovery, maintenance & dependency suppression, transports
  (~30), template variables.
- **API v0 categories**: devices, ports, sensors (health), inventory, bgp,
  ospf, alerts, rules, services, bills, logs (event/sys/alert/auth), locations,
  device groups, port groups — mapped to the new `/api/monitoring/v1` design.
- **Trap handling** (snmptrapd → handler classes), **syslog** ingestion,
  **billing** (quota + 95th percentile), **distributed polling** (dispatcher
  service, poller groups, Redis queues), **service checks**
  (Nagios-compatible), **maps**, **Oxidized/NfSen/SmokePing/Graylog/Prometheus
  integrations**.

## What "parity" means here

Functional and data-collection parity as defined in
[`librenms-feature-parity.md`](./librenms-feature-parity.md), which tracks
Complete / Partially complete / Blocked / Not applicable status per capability
with evidence. It explicitly does **not** mean copying GPL code, the LibreNMS
name/logo, UI artwork, or website text.

## Direct source reuse audit

None. Any future proposal to port upstream source verbatim must be flagged in
review and pass a GPLv3 licensing assessment before inclusion; as of this
snapshot the implementation contains no LibreNMS-derived code, YAML, or SQL.
