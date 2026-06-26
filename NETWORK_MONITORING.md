# Network Module — Real Device Monitoring

The Network app monitors **real** devices using **ICMP ping** and **SNMP v1/v2c**.
There is no longer any simulated/dummy data: every status, latency, interface, and
alert comes from an actual device on your network.

## How it works

- **Poller** (`server/plugins/netPoller.ts`): every `NUXT_NET_POLL_INTERVAL_SECONDS`
  it ICMP-pings each device (status + latency) and, for SNMP devices that respond,
  reads system info (sysName, sysDescr, sysObjectID, uptime) and the interface table
  (admin/oper status, speed, MAC, MTU, and **bit-rate computed from counter deltas**).
- **ICMP-latency sensor**: each device gets a live `ICMP Latency` sensor (ms).
- **Auto-alerts**: when a device stops responding a **critical** alert opens; when it
  recovers, the alert is cleared.
- **Discovery** (`Network → Discovery`): a real ICMP/SNMP sweep of a CIDR that creates
  a device for every responder. The poller then fills in interfaces on the next cycle.

> **SNMPv3** (auth/priv) is not supported yet — devices set to v3 are pinged only.
> Flow (NetFlow) and Syslog collectors are not implemented; those pages stay empty
> until a collector is added.

## Prerequisites

1. **Reachability** from the server running KNetraHub to your devices:
   - **ICMP** echo allowed (for ping / status / latency).
   - **UDP/161** open (for SNMP polling and discovery identification).
2. **A working `ping` binary.**
   - Docker: the image installs `iputils` automatically.
   - Bare metal: ensure `ping` is on `PATH` (Linux `iputils`, macOS/Windows built-in).
3. **SNMP enabled on the devices** with a community string you know (commonly `public`
   read-only). Each device can store its own version/community; otherwise the defaults
   below are used.

## Configure (env)

All optional — sensible defaults shown. See `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `NUXT_NET_POLLING_ENABLED` | `true` | Master switch for the poller |
| `NUXT_NET_POLL_INTERVAL_SECONDS` | `60` | How often each device is polled |
| `NUXT_NET_POLL_CONCURRENCY` | `16` | Devices polled in parallel |
| `NUXT_NET_SNMP_COMMUNITY` | `public` | Default community (per-device value wins) |
| `NUXT_NET_SNMP_VERSION` | `v2c` | Default SNMP version (`v1`/`v2c`) |
| `NUXT_NET_SNMP_TIMEOUT_MS` | `2000` | Per-request SNMP timeout |
| `NUXT_NET_PING_TIMEOUT_SECONDS` | `2` | Per-host ICMP timeout |
| `NUXT_NET_DISCOVERY_CONCURRENCY` | `64` | Parallel hosts during a scan |

## Add devices

**Option A — Auto-discovery (recommended)**

1. Go to **Network → Discovery** (needs the Network *operator* tier).
2. Enter a subnet, e.g. `192.168.1.0/24` (max **1024 hosts** per scan — scan large
   networks one /24 at a time).
3. Pick a method:
   - **Ping + SNMP** (default): ping sweep, then SNMP-identify responders.
   - **Ping only**: add every host that answers ICMP as a ping-only device.
   - **SNMP only**: add only hosts that answer SNMP.
4. Optionally set the **SNMP community** for this scan.
5. **Start Scan.** Responders are added immediately; status/interfaces fill in within
   one poll interval.

**Option B — Add one device**

1. **Network → Devices → Add Device.**
2. Enter hostname + IP, choose **SNMP** (set version + community) or **Ping Only**.
3. Save; the next poll cycle populates status, latency, and ports.

## Clean up old/dummy data

Existing databases keep whatever was seeded before. To remove devices:

- **Per device:** the trash icon on **Network → Devices** (cascades to that device's
  interfaces, sensors, alerts, etc.).
- **Full reset (SQL):** stop relying on the app, then:

  ```sql
  TRUNCATE net_flows, net_syslog, net_backups, net_device_groups, net_sensors,
           net_interfaces, net_alerts, net_devices RESTART IDENTITY CASCADE;
  ```

  Fresh installs start empty automatically — no fake devices are seeded.

## Verify it's working

- A device you can ping should flip to **up** with a latency value within one interval.
- Unplug it (or block ICMP) → it goes **down** and a critical alert appears on
  **Network → Alerts**; restore it → the alert clears.
- For SNMP devices, the **Ports** tab on the device page lists interfaces, and
  in/out bit-rates appear from the **second** poll onward (first poll seeds counters).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Everything shows **down** | ICMP blocked from the server, or `ping` binary missing |
| Status up but **no SNMP data** | Wrong community/version, UDP/161 blocked, or device is v3 |
| **No bit-rates** on interfaces | Only one poll has run — wait one more interval |
| Discovery finds **nothing** | Wrong CIDR, firewall, or community; try `Ping only` first |
| Scan rejected as **too large** | Range > 1024 hosts — scan a smaller subnet (e.g. /24) |
