// Shared constants for the Monitoring module (client + server).

/** Device operational status (unified model — LibreNMS-equivalent). */
export const DEVICE_STATUSES = [
  'up', // ICMP (and SNMP where enabled) responding
  'down', // unreachable
  'degraded', // reachable but partial (e.g. ICMP up, SNMP unreachable, or incomplete collection)
  'disabled', // polling disabled by an operator
  'ignored', // polled but excluded from alerting/availability
  'maintenance', // inside an active maintenance window
  'pending' // added, first discovery not finished yet
] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

/** Protocol-level availability, tracked separately from overall status. */
export type ProtoAvailability = 'up' | 'down' | 'unknown' | 'disabled'

/** SNMP configuration shapes supported by the engine. */
export const SNMP_VERSIONS = ['v1', 'v2c', 'v3'] as const
export type SnmpVersion = (typeof SNMP_VERSIONS)[number]
export const SNMPV3_LEVELS = ['noAuthNoPriv', 'authNoPriv', 'authPriv'] as const
export type SnmpV3Level = (typeof SNMPV3_LEVELS)[number]
export const SNMP_AUTH_PROTOCOLS = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'] as const
export type SnmpAuthProtocol = (typeof SNMP_AUTH_PROTOCOLS)[number]
export const SNMP_PRIV_PROTOCOLS = ['des', 'aes', 'aes256b', 'aes256r'] as const
export type SnmpPrivProtocol = (typeof SNMP_PRIV_PROTOCOLS)[number]

/** Health sensor classes (LibreNMS-equivalent set). */
export const SENSOR_CLASSES = [
  'airflow', 'ber', 'bitrate', 'charge', 'chromatic_dispersion', 'cooling',
  'count', 'current', 'dbm', 'delay', 'eer', 'fanspeed', 'frequency',
  'humidity', 'load', 'loss', 'percent', 'power', 'power_consumed',
  'power_factor', 'pressure', 'quality_factor', 'runtime', 'signal', 'snr',
  'state', 'temperature', 'tv_signal', 'voltage', 'waterflow', 'signal_loss'
] as const
export type SensorClass = (typeof SENSOR_CLASSES)[number]

/** Wireless sensor classes. */
export const WIRELESS_CLASSES = [
  'ap-count', 'capacity', 'ccq', 'channel', 'cell', 'clients', 'distance',
  'error-rate', 'error-ratio', 'errors', 'frequency', 'mse', 'noise-floor',
  'power', 'quality', 'rate', 'rssi', 'snr', 'sinr', 'rsrq', 'rsrp', 'xpi',
  'ssr', 'utilization'
] as const
export type WirelessClass = (typeof WIRELESS_CLASSES)[number]

/** Alert severities. */
export const ALERT_SEVERITIES = ['ok', 'warning', 'critical'] as const
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number]

/** Alert incident states. */
export const ALERT_STATES = ['open', 'acknowledged', 'recovered', 'suppressed', 'closed'] as const
export type AlertState = (typeof ALERT_STATES)[number]

/** Job lifecycle states in the durable queue. */
export const JOB_STATES = ['pending', 'running', 'done', 'failed', 'dead'] as const
export type JobState = (typeof JOB_STATES)[number]

/** Job types the dispatcher schedules. */
export const JOB_TYPES = ['poll', 'discovery', 'discovery_scan', 'services', 'alerts', 'housekeeping', 'billing'] as const
export type JobType = (typeof JOB_TYPES)[number]

/**
 * Final outcomes for a planned collection item. The no-silent-loss rule:
 * every planned item must end in exactly one of these.
 */
export const COLLECTION_OUTCOMES = [
  'success', // value(s) persisted
  'empty', // request succeeded, no rows/instances (recorded, not an error)
  'unsupported', // confirmed not supported by the device (noSuchObject/EndOfMib)
  'skipped', // intentionally skipped, reason recorded
  'timeout',
  'auth_failure',
  'parse_error',
  'db_error',
  'failed' // other failure, error recorded
] as const
export type CollectionOutcome = (typeof COLLECTION_OUTCOMES)[number]

/** Service check types. */
export const SERVICE_TYPES = ['icmp', 'tcp', 'http', 'dns', 'certificate', 'smtp', 'ssh', 'ntp'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

/** Built-in alert transport types (all fetch/socket based, config encrypted at rest). */
export const TRANSPORT_TYPES = [
  'webhook', 'slack', 'discord', 'telegram', 'teams', 'mattermost',
  'rocketchat', 'gotify', 'ntfy', 'pushover', 'pagerduty', 'opsgenie', 'smtp'
] as const
export type TransportType = (typeof TRANSPORT_TYPES)[number]

/** Entity kinds alert rules and events can reference. */
export const ENTITY_TYPES = ['device', 'port', 'sensor', 'processor', 'mempool', 'storage', 'service', 'bgp_peer', 'wireless_sensor'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

/**
 * Well-known subtrees offered by the raw SNMP capture tool (device Capture
 * tab / POST /devices/:id/capture). Shared so the UI renders the same list
 * the API validates.
 */
export const SNMP_CAPTURE_PRESETS = [
  { value: 'system', label: 'System (SNMPv2-MIB)', oid: '1.3.6.1.2.1.1' },
  { value: 'interfaces', label: 'Interfaces (IF-MIB ifTable)', oid: '1.3.6.1.2.1.2.2' },
  { value: 'ifx', label: 'Interfaces extended (IF-MIB ifXTable)', oid: '1.3.6.1.2.1.31.1.1' },
  { value: 'ip', label: 'IP addressing / ARP (IP-MIB)', oid: '1.3.6.1.2.1.4' },
  { value: 'host-resources', label: 'Host resources (HOST-RESOURCES-MIB)', oid: '1.3.6.1.2.1.25' },
  { value: 'entity', label: 'Physical inventory (ENTITY-MIB)', oid: '1.3.6.1.2.1.47' },
  { value: 'entity-sensors', label: 'Sensors (ENTITY-SENSOR-MIB)', oid: '1.3.6.1.2.1.99' },
  { value: 'bridge', label: 'Bridge / FDB (BRIDGE-MIB)', oid: '1.3.6.1.2.1.17' },
  { value: 'ucd', label: 'UCD-SNMP (net-snmp agents)', oid: '1.3.6.1.4.1.2021' },
  { value: 'mib2', label: 'Full MIB-2 subtree (slow, diagnostic)', oid: '1.3.6.1.2.1' }
] as const
export type SnmpCapturePreset = (typeof SNMP_CAPTURE_PRESETS)[number]['value']

/** Pagination defaults for the v1 API. */
export const API_DEFAULT_PER_PAGE = 50
export const API_MAX_PER_PAGE = 500
