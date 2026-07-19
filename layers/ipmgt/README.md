# IP Address Management (IPAM)

`layers/ipmgt` is KNetraHub's IP Address Management module — a phpIPAM-style system for
address-space, VLAN/VRF, and network-asset tracking, built as a [Nuxt layer](https://nuxt.com/docs/getting-started/layers)
that merges into the same in-process build as the Docker and Monitoring modules. It is not a
fork or clone of phpIPAM; it targets equivalent functionality using this codebase's own stack,
conventions, and security model.

## Feature summary

**Address space** — Sections (nested), Subnets (IPv4 + IPv6, nested, overlap-checked per
VRF), IP Addresses (with full change history), visual per-subnet address grid (each cell
labeled with its last octet, phpIPAM-style), subnet calculator/splitter with reverse-DNS zone
display.

**Network resources** — VLANs + Layer-2 domains, VRFs, Devices (with encrypted SNMP
credentials), Locations, Customers, Racks (visual front/rear elevation diagrams with U-number
rails, mini per-card previews, overlap and bounds-validated placement — see
[Using racks](#using-racks)), Circuits + providers (two-endpoint mapping, expiry tracking),
NAT rule bindings.

**Discovery** — scheduled host-status scanning and new-host discovery (ICMP) per subnet, plus
a manual "Run scan" action that resolves reverse-DNS hostnames and presents discovered hosts
in a review dialog (editable hostname/description per host) — nothing is saved until the
operator confirms "Add discovered hosts"; scheduled scans auto-add. Real SNMP (v1/v2c/v3)
system-info test and ARP-table discovery per device; full scan-run history.

**Operations** — IP request/approval workflow (concurrency-safe first-free allocation under a
per-subnet advisory lock); bulk JSON/CSV import and export for every major entity; global
cross-entity search; encrypted vault for infrastructure secrets (reveal requires re-authentication
and is audited); admin-defined custom fields on any major entity type.

**Administration** — module settings, per-user activity/system logs (shared portal
infrastructure), REST API documented in the portal's OpenAPI spec (`/api/swagger/openapi`).

## Using racks

Racks live under **Network resources → Racks**. Each rack card shows a to-scale miniature of
the front face; click the card (or "View rack diagram") to open the rack detail page, which
renders the **[F] front and [R] rear elevations side by side** with U numbers on both rails,
next to a facts panel listing everything placed in the rack.

**Creating a rack** — "Add Rack" on the list page. Size (U), starting unit, and numbering
orientation (top-down vs bottom-up) control how the elevation is drawn; location/room/row are
informational.

**Adding equipment** (operator tier, `ipmgt.create`):

- **Add device** — places a unit linked to a device from the Devices inventory (the link is
  optional and can be changed later; linked devices show their hostname on the elevation).
- **Add custom equipment** — anything that isn't an inventory device: patch panel, PDU,
  shelf, chassis, blank panel, or "other". Same dialog, no device link.
- Both buttons preselect the first free U on the front face; alternatively **click any empty
  slot** in either elevation to place equipment at that exact U and side.
- The dialog fields: name (required), type, linked device, position U, height in U (multi-U
  items span down the elevation), side (front/rear — the two faces are independent), display
  color, and notes.
- Placement is validated server-side: items must fit inside the rack's U range and may not
  overlap another item on the same face (HTTP 409 with the conflicting item's name/position).

**Editing / removing** — click a placed item in the elevation (or its row in the facts
panel's Devices list) to reopen the dialog; change any field to move/resize/recolor it, or
"Remove" to unplace it. Removing an item never deletes the linked device itself. Deleting a
whole rack requires admin tier plus password re-confirmation and removes its placements.

## Architecture notes

- **No ORM.** Raw `pg` via `getDb()` (`server/utils/db.ts`), parameterized queries throughout.
- **Schema evolution is additive-only.** All `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD
  COLUMN IF NOT EXISTS` statements live in one idempotent `runMigrations()` function in
  `server/utils/db.ts` — there is no separate migration-file system in this repo.
- **Permissions** reuse the existing flat `ipmgt.*` vocabulary (`shared/utils/permissions.ts`):
  `view`/`export` (viewer), `create`/`update`/`assign`/`import`/`scan`/`request` (operator),
  `approve` (manager), `delete`/`settings` (admin). No new per-entity permission keys were
  introduced. The Vault and Custom Field definitions additionally gate at `manager`/`admin`
  tier respectively, tighter than the base CRUD tiers given their sensitivity.
- **Step-up authentication** (`requirePasswordConfirm` + `<ConfirmPasswordModal>`, the same
  pattern used by Docker's destructive actions) protects deletes with real blast radius:
  Subnets, Sections, VLANs, VRFs, Devices, Locations, Customers, Racks, Custom Field
  definitions, and Vault items. Releasing a single address is deliberately left as a plain
  confirm — routine and trivially reversible.
- **Secrets** (device SNMP credentials, vault item values) are encrypted at rest with the
  existing `server/utils/secretCrypto.ts` (AES-256-GCM). List/detail API responses never
  include them in any form — devices expose `snmp_*_set` booleans, vault items have no value
  field at all outside the dedicated, audited reveal endpoint.
- **Concurrency-safe allocation.** First-free address allocation (subnet "reserve first free"
  and IP-request approval) runs inside a Postgres advisory lock scoped to the subnet
  (`withSubnetLock` in `ipamStore.ts`), so two simultaneous requests against the same subnet
  can never receive the same address.
- **Background scanning** follows the same pattern as Monitoring's pollers: a plain
  `setTimeout` + `setInterval` Nitro plugin (`server/plugins/ipamScanner.ts`), no job-queue
  library. Configure via `NUXT_IPMGT_SCAN_ENABLED` / `NUXT_IPMGT_SCAN_INTERVAL_SECONDS` /
  `NUXT_IPMGT_SCAN_CONCURRENCY` / `NUXT_IPMGT_PING_TIMEOUT_SECONDS` (see `nuxt.config.ts`).
- **Cross-layer isolation.** `ipmgt` never imports from `layers/docker` or `layers/monitoring`
  (and vice versa) — the SNMP client and scan primitives are local, small ports of the
  equivalent Monitoring code rather than shared imports, matching this repo's existing
  layer-isolation invariant.

## Data model

All tables are prefixed `ipmgt_`. Core: `sections`, `subnets`, `ips` (+ `ip_history`),
`l2domains`, `vlans`, `vrfs`. Assets: `locations`, `customers`, `devices`, `racks` (+
`rack_items`), `circuit_providers`, `circuits`, `nat_rules`. Operations: `requests`,
`scan_history`, `custom_field_defs` (+ `custom_field_values`), `vault_items` (+
`vault_access_log`). See `server/utils/db.ts` (search `-- IPAM Module`) for exact columns —
each phase of the build is commented with what it added and why.

## Security

- SQL is always parameterized; the only string-built SQL uses compile-time-fixed table/column
  names from an internal allow-list (`usedByRows`, `resolveIdByName`), never request input.
- SNMP/ping targets are always a validated, canonical IP passed as a function argument to the
  `ping`/`net-snmp` libraries — never shell-interpolated.
- CSV export sanitizes formula-injection-prone leading characters (`=`, `+`, `-`, `@`).
- Every mutation is captured automatically in the portal's per-module activity/system log
  (no per-handler opt-in needed) plus a curated `ipamAudit()` call; vault reveals get an
  additional dedicated per-item access log.

## Known limitations / deferred enhancements

Disclosed explicitly rather than silently omitted:

- **DNS**: reverse-zone calculation and the DNS consistency checker (Tools page) are real and
  self-contained. Pushing records to an external DNS server (PowerDNS, etc.) is wired in
  settings but not connected to a live server — this remains a placeholder, same as before this
  work started.
- **DHCP/Kea integration**: not implemented.
- **Native-field "required" admin config**: custom fields support a `required` flag (enforced
  server-side); making the *built-in* columns (e.g. subnet description) admin-configurable-required
  is not implemented.
- **Rate limiting, request IDs, and idempotency keys**: not implemented anywhere in this
  application (not just IPAM) — introducing them only for this module would be inconsistent
  with the rest of the platform; this is a platform-wide gap, not an IPAM-specific one.
- **BGP/routing, multicast, firewall-zone generation, PSTN numbering, distributed multi-site
  scan agents**: out of scope by explicit user decision — carrier/telco features that don't fit
  this platform's actual deployments.
- **Automated test suite**: this repo has no test framework at all (confirmed at the start of
  this work, not specific to IPAM). Every phase of this build was instead verified end-to-end
  against a disposable TimescaleDB container + the built server (migration idempotency, full
  CRUD, security properties, concurrency behavior) rather than left unverified — see commit
  history for what was checked per phase. Introducing a real test framework remains undone.
- **Required-fields / visible_list / visible_export custom-field flags**: captured and stored,
  but not yet consumed by entity list-table rendering or the export column set — only the
  create/edit form panel and `required`/`unique` validation are wired end-to-end today.

## Configuration

New environment variables (all optional, sensible defaults):

| Variable | Default | Purpose |
|---|---|---|
| `NUXT_IPMGT_SCAN_ENABLED` | `true` | Scheduled host-status/discovery scanning |
| `NUXT_IPMGT_SCAN_INTERVAL_SECONDS` | `300` | Scan cycle interval |
| `NUXT_IPMGT_SCAN_CONCURRENCY` | `16` | Max concurrent pings per cycle |
| `NUXT_IPMGT_PING_TIMEOUT_SECONDS` | `2` | Per-host ping timeout |

No new required configuration — the module works with zero IPAM-specific env vars set.

## API

Every endpoint is documented in the portal's OpenAPI spec, served at `/api/swagger/openapi`
(tag `ipam`). All endpoints live under `/api/ipmgt/*`.
