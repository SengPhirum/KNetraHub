# Application Collectors — Parity Matrix

The application-monitoring **framework** (`monitoring.applications`,
`monitoring.application_metrics`, `app_type`/`instance` model, registry
extension point described in
[`module-guides.md`](./module-guides.md#application-plugin-guide)) is
**Complete**. Every individual collector below is **Blocked** — none of the
~60 LibreNMS application collectors are implemented. This is recorded
explicitly per the mandate ("unsupported application collectors must appear
in the parity matrix rather than being silently omitted") rather than left
out of the docs.

| Application | Status |
|---|---|
| Apache | Blocked |
| Asterisk | Blocked |
| BIND9 | Blocked |
| BIRD2 | Blocked |
| Backupninja | Blocked |
| BorgBackup | Blocked |
| CAPEv2 | Blocked |
| Certificates | Blocked (note: TLS certificate *expiry* is covered by the `certificate` service-check type, which is a different mechanism than the LibreNMS application collector) |
| Chrony | Blocked |
| Docker statistics | Blocked |
| Exim | Blocked |
| Entropy | Blocked |
| Fail2ban | Blocked |
| FreeRADIUS | Blocked |
| FreeSWITCH | Blocked |
| GPSD | Blocked |
| HTTP access logs | Blocked |
| Hypervisor monitoring | Blocked |
| ISC DHCP statistics | Blocked |
| Icecast | Blocked |
| Linux Softnet | Blocked |
| Linux configuration-file status | Blocked |
| Log size | Blocked |
| Mailcow/Postfix | Blocked |
| MailScanner | Blocked |
| mdadm | Blocked |
| MegaRAID | Blocked |
| Memcached | Blocked |
| Munin | Blocked |
| MySQL/MariaDB | Blocked |
| NFS clients and servers | Blocked |
| NGINX | Blocked |
| NTP clients and servers | Blocked (service-check NTP reachability exists; not the application collector) |
| Nextcloud | Blocked |
| NVIDIA GPUs | Blocked |
| OS-level virtualization | Blocked |
| Operating-system updates | Blocked |
| Open Grid Scheduler | Blocked |
| OpenSearch | Blocked |
| Elasticsearch | Blocked |
| OpenSIPS | Blocked |
| PHP-FPM | Blocked |
| Pi-hole | Blocked |
| Port activity | Blocked |
| Postfix | Blocked |
| PostgreSQL | Blocked |
| PowerDNS | Blocked |
| PowerDNS Recursor | Blocked |
| dnsdist | Blocked |
| Privoxy | Blocked |
| Proxmox | Blocked |
| Puppet Agent | Blocked |
| PureFTPd | Blocked |
| Raspberry Pi | Blocked |
| Raspberry Pi GPIO | Blocked |
| Redis | Blocked |
| Routinator | Blocked |
| SMART disk health | Blocked |
| Sagan | Blocked |
| Seafile | Blocked |
| Socket statistics | Blocked |
| Squid | Blocked |
| Supervisord | Blocked |
| Suricata | Blocked |
| systemd | Blocked |
| TinyDNS | Blocked |
| UPS through APC and NUT | Blocked (note: UPS-MIB *SNMP* battery/output monitoring is covered by the `sensors` module — this row is specifically about the agent-based apcupsd/NUT application collector) |
| Unbound | Blocked |
| VoIP Monitor | Blocked |
| WireGuard | Blocked |
| XCP-ng virtual machines | Blocked |
| ZFS | Blocked |

## Why this is the largest gap

LibreNMS's application collectors generally require either an SNMP extend
script, an agent, or SSH-executed commands on the monitored host — a
fundamentally different collection model than the agentless SNMP-only
approach this rebuild prioritized for infrastructure devices (routers,
switches, servers-via-SNMP). Building out this list is legitimate follow-up
work with its own design questions (agent distribution? SSH credential
storage? extend-script contract?) rather than something to stub out.
