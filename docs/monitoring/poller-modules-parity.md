# Poller Modules — Parity Matrix

Implemented modules live in `layers/monitoring/server/polling/modules/`,
registered via `definePollerModule()`.

| LibreNMS module | KNetraHub module | File | Status | Evidence |
|---|---|---|---|---|
| availability (ICMP) | `availability` | `availability.ts` | **Complete** | outage tracking, up/down events |
| os/system (sysUpTime, reboot detect) | `system` | `system.ts` | **Complete** | reboot detection via `detectReboot()` |
| ports | `ports` | `ports.ts` | **Complete** | every discovered port, full counter set, rollover-safe |
| processors | `processors` | `health.ts` | **Complete** | |
| mempools | `mempools` | `health.ts` | **Complete** | |
| storage | `storage` | `health.ts` | **Complete** | table-walk refresh, not per-row GETs |
| sensors (health) | `sensors` | `health.ts` | **Complete** | threshold evaluation + state-transition events |
| bgp-peers | `bgp` | `routing.ts` | **Complete** | |
| ospf | `ospf` | `routing.ts` | **Complete** | |
| entity-state / entity physical refresh | — | — | **Blocked** | Inventory is discovered but not re-polled for live state changes between discovery cycles |
| ipmi | — | — | **Blocked** | Not implemented |
| unix-agent / check_mk agent | — | — | **Blocked** | Not implemented (agentless SNMP-only model) |
| host-resources (rolled into processors/mempools/storage) | folded in | `health.ts` | **Complete** | |
| ucd (rolled into processors/mempools) | folded in | `health.ts` | **Complete** | |
| ip-system-stats | — | — | **Blocked** | Not implemented |
| xdsl | — | — | **Blocked** | Not implemented |
| nac | — | — | **Blocked** | Not implemented |
| juniper-atm-vp | — | — | **Blocked** | Not implemented |
| printer-supplies (as sensors) | folded into `sensors` | `health.ts` | **Complete** | not re-discovered incrementally, but polled as sensors |
| ucd-diskio | — | — | **Blocked** | Not implemented |
| wireless | — | — | **Blocked** | see feature-parity §5 |
| ospfv3 | — | — | **Blocked** | OSPFv2 only |
| cisco-ipsec-flow-monitor | — | — | **Blocked** | Not implemented |
| cisco-remote-access-monitor | — | — | **Blocked** | Not implemented |
| cisco-cef | — | — | **Blocked** | Not implemented |
| ipsla | — | — | **Blocked** | Not implemented |
| mac-accounting | — | — | **Blocked** | Not implemented |
| ipsec-tunnels | — | — | **Blocked** | Not implemented |
| cisco-ace (load balancer/server farm) | — | — | **Blocked** | Not implemented |
| cisco-cbqos | — | — | **Blocked** | Not implemented |
| cisco-otv | — | — | **Blocked** | Not implemented |
| cisco-vpdn | — | — | **Blocked** | Not implemented |
| netscaler-vsvrs | — | — | **Blocked** | Not implemented |
| aruba-controller | — | — | **Blocked** | Not implemented (generic wireless module gap) |
| applications | schema ready, no collectors | — | **Blocked** | see `applications-parity.md` |
| services | `services/runner.ts` (not a discovery-style poller module — its own scheduler) | — | **Complete** | equivalent capability, different execution path (queue job `services`, not per-device poll module) |
| stp | discovery-only refresh | — | **Partially complete** | STP root/priority discovered but not re-polled incrementally each cycle (rediscovered on the 6h cycle instead) |
| virtual-machine info | — | — | **Blocked** | Not implemented |
| ntp | service-check type only | `services/runner.ts` | **Partially complete** | NTP reachability check exists as a service type; no dedicated NTP peer/offset poller |
| load-balancers | — | — | **Blocked** | Not implemented |
| mef | — | — | **Blocked** | Not implemented |

## Notes on module independence

Every module above satisfies the "independently enabled/disabled/scheduled/
tested/timed/retried/logged/reported" requirement through the shared
`core/moduleSettings.ts` precedence resolver and the `module_runs` audit
table — this is enforced structurally for every registered module, not
per-module code.
