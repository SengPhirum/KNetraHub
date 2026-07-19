# Discovery Modules — Parity Matrix

Implemented modules live in `layers/monitoring/server/discovery/modules/`,
registered via `defineDiscoveryModule()`.

| LibreNMS module | KNetraHub module | File | Status | Evidence |
|---|---|---|---|---|
| os (core detection) | `core` | `core.ts` | **Complete** | sysDescr/sysObjectID → `detectOs()`, persists identity + location |
| ports | `ports` | `ports.ts` | **Complete** | full IF-MIB + ifX table, every ifIndex |
| ipv4-addresses | `ipv4-addresses` | `addresses.ts` | **Complete** | ipAddrTable, netmask→prefix |
| ipv6-addresses | `ipv6-addresses` | `addresses.ts` | **Complete** | RFC 4293 ipAddressTable |
| arp-table | `arp-table` | `addresses.ts` | **Complete** | ipNetToMediaTable |
| vlans | `vlans` | `switching.ts` | **Complete** | Q-BRIDGE dot1qVlanStaticTable |
| fdb-table | `fdb-table` | `switching.ts` | **Complete** | dot1dTpFdbTable + bridge-port→ifIndex mapping |
| stp | `stp` | `switching.ts` | **Complete** | single dot1d instance; MST/PVST+ per-instance not distinguished |
| discovery-protocols (LLDP/CDP) | `discovery-protocols` | `switching.ts` | **Complete** | cross-links to known devices by hostname |
| processors | `processors` | `health.ts` | **Complete** | hrProcessorTable + UCD ssCpu fallback |
| mempools | `mempools` | `health.ts` | **Complete** | UCD memory + hrStorage RAM/virtual |
| storage | `storage` | `health.ts` | **Complete** | every hrStorage fixedDisk row |
| sensors | `sensors` | `health.ts` | **Complete** | ENTITY-SENSOR + LM-SENSORS + UPS-MIB + Printer-MIB |
| entity-physical | `entity-physical` | `health.ts` | **Complete** | full ENTITY-MIB tree |
| hr-device | `hr-devices` | `health.ts` | **Complete** | hrDeviceTable + hrProcessorLoad; network rows matched to ports |
| bgp | `bgp` | `routing.ts` | **Complete** | BGP4-MIB peer table |
| ospf | `ospf` | `routing.ts` | **Complete** | OSPF-MIB general + neighbor table |
| port-stack | — | — | **Blocked** | dot1dStackTable not implemented |
| cisco-vrf-lite | — | — | **Blocked** | Not implemented |
| mac-accounting | — | — | **Blocked** | Not implemented |
| pseudowires | — | — | **Blocked** | Not implemented |
| vrf | — | — | **Blocked** | Not implemented |
| cisco-cef | — | — | **Blocked** | Not implemented |
| slas (IP-SLA) | — | — | **Blocked** | Not implemented |
| cisco-otv | — | — | **Blocked** | Not implemented |
| routing tables | — | — | **Blocked** | Not implemented |
| juniper-atm-vp | — | — | **Blocked** | Not implemented |
| virtual-machine info | — | — | **Blocked** | Not implemented |
| printer-supplies | folded into `sensors` | `health.ts` | **Complete** | represented as `percent`-class sensors, not a separate entity table |
| ucd-diskio | — | — | **Blocked** | Not implemented |
| applications | schema ready | — | **Blocked** | see `applications-parity.md` |
| services | manual config, no auto-discovery | `services/runner.ts` | **Partially complete** | service checks run once created; no auto-discovery of likely services |
| ntp | — | — | **Blocked** | Not implemented as a discovery module (service-check type exists) |
| load-balancers | — | — | **Blocked** | Not implemented |
| mef | — | — | **Blocked** | Not implemented |
| wireless | schema ready | — | **Blocked** | see feature-parity §5 |
| xdsl | — | — | **Blocked** | Not implemented |
| nac (802.1X) | — | — | **Blocked** | Not implemented |
| ospfv3 | — | — | **Blocked** | OSPFv2 only |

## Automatic device-discovery methods

| Method | Status | Notes |
|---|---|---|
| LLDP/CDP neighbor discovery | **Complete** | feeds `topology_links`, not yet used to auto-add unknown neighbors as new devices |
| CIDR scan | **Complete** | `POST /discovery/scan` |
| ARP-based discovery | **Blocked** | ARP table is collected per-device but not used to seed new device candidates |
| OSPF/BGP neighbor discovery (auto-add) | **Blocked** | Neighbors are recorded, not auto-added as devices |
| Seed-device / previously-discovered queue | **Not applicable** | superseded by the durable job queue's discovery jobs |
| Reverse-DNS-assisted discovery | **Blocked** | Not implemented |
| Duplicate detection (sysName/serial/management-IP) | **Complete** | `discovery/scan.post.ts` checks existing `ip`/`hostname` before insert; sysName/serial-based dedupe happens implicitly via `core.ts` identity but isn't a pre-add check |
| Allowed/excluded CIDR safety lists | **Complete** | `exclude` param on scan; global allow-list not yet a persisted setting |
