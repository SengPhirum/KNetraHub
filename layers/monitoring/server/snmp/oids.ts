/**
 * Standard MIB OIDs used by the built-in discovery/polling modules.
 * Numeric-only — the engine does not require MIB files at runtime; names
 * here document intent. Sources: RFC 1213 (MIB-II), RFC 2863 (IF-MIB),
 * RFC 2790 (HOST-RESOURCES), RFC 3433 (ENTITY-SENSOR), RFC 4133 (ENTITY),
 * RFC 4188 (BRIDGE), RFC 4293 (IP-MIB), RFC 4273 (BGP4), RFC 4750 (OSPF),
 * UCD-SNMP-MIB, LLDP-MIB (IEEE 802.1AB), Q-BRIDGE-MIB, Printer-MIB, UPS-MIB.
 */

export const SYS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  sysServices: '1.3.6.1.2.1.1.7.0'
} as const

/** IF-MIB interface table columns (classic + high-capacity). */
export const IF = {
  ifIndex: '1.3.6.1.2.1.2.2.1.1',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifType: '1.3.6.1.2.1.2.2.1.3',
  ifMtu: '1.3.6.1.2.1.2.2.1.4',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifLastChange: '1.3.6.1.2.1.2.2.1.9',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifInUcastPkts: '1.3.6.1.2.1.2.2.1.11',
  ifInDiscards: '1.3.6.1.2.1.2.2.1.13',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifInUnknownProtos: '1.3.6.1.2.1.2.2.1.15',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifOutUcastPkts: '1.3.6.1.2.1.2.2.1.17',
  ifOutDiscards: '1.3.6.1.2.1.2.2.1.19',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20',
  // ifXTable
  ifName: '1.3.6.1.2.1.31.1.1.1.1',
  ifInMulticastPkts: '1.3.6.1.2.1.31.1.1.1.2',
  ifInBroadcastPkts: '1.3.6.1.2.1.31.1.1.1.3',
  ifOutMulticastPkts: '1.3.6.1.2.1.31.1.1.1.4',
  ifOutBroadcastPkts: '1.3.6.1.2.1.31.1.1.1.5',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',
  ifHCInUcastPkts: '1.3.6.1.2.1.31.1.1.1.7',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
  ifHCOutUcastPkts: '1.3.6.1.2.1.31.1.1.1.11',
  ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15',
  ifAlias: '1.3.6.1.2.1.31.1.1.1.18'
} as const

/** IP-MIB addressing + ARP/ND. */
export const IPMIB = {
  ipAdEntAddr: '1.3.6.1.2.1.4.20.1.1',
  ipAdEntIfIndex: '1.3.6.1.2.1.4.20.1.2',
  ipAdEntNetMask: '1.3.6.1.2.1.4.20.1.3',
  // ipNetToMediaTable (ARP)
  ipNetToMediaIfIndex: '1.3.6.1.2.1.4.22.1.1',
  ipNetToMediaPhysAddress: '1.3.6.1.2.1.4.22.1.2',
  ipNetToMediaNetAddress: '1.3.6.1.2.1.4.22.1.3',
  ipNetToMediaType: '1.3.6.1.2.1.4.22.1.4',
  // ipAddressTable (v4+v6 unified, RFC 4293)
  ipAddressIfIndex: '1.3.6.1.2.1.4.34.1.3',
  ipAddressPrefix: '1.3.6.1.2.1.4.34.1.5'
} as const

/** HOST-RESOURCES-MIB. */
export const HR = {
  hrSystemUptime: '1.3.6.1.2.1.25.1.1.0',
  hrMemorySize: '1.3.6.1.2.1.25.2.2.0',
  hrStorageIndex: '1.3.6.1.2.1.25.2.3.1.1',
  hrStorageType: '1.3.6.1.2.1.25.2.3.1.2',
  hrStorageDescr: '1.3.6.1.2.1.25.2.3.1.3',
  hrStorageAllocationUnits: '1.3.6.1.2.1.25.2.3.1.4',
  hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrDeviceType: '1.3.6.1.2.1.25.3.2.1.2',
  hrDeviceDescr: '1.3.6.1.2.1.25.3.2.1.3',
  hrDeviceStatus: '1.3.6.1.2.1.25.3.2.1.5',
  hrDeviceErrors: '1.3.6.1.2.1.25.3.2.1.6',
  hrSystemNumUsers: '1.3.6.1.2.1.25.1.5.0',
  hrSystemProcesses: '1.3.6.1.2.1.25.1.6.0'
} as const

/** hrDeviceType OID values (hrDeviceTypes subtree) → LibreNMS-style names. */
export const HR_DEVICE_TYPES: Record<string, string> = {
  '1.3.6.1.2.1.25.3.1.1': 'hrDeviceOther',
  '1.3.6.1.2.1.25.3.1.2': 'hrDeviceUnknown',
  '1.3.6.1.2.1.25.3.1.3': 'hrDeviceProcessor',
  '1.3.6.1.2.1.25.3.1.4': 'hrDeviceNetwork',
  '1.3.6.1.2.1.25.3.1.5': 'hrDevicePrinter',
  '1.3.6.1.2.1.25.3.1.6': 'hrDeviceDiskStorage',
  '1.3.6.1.2.1.25.3.1.10': 'hrDeviceVideo',
  '1.3.6.1.2.1.25.3.1.11': 'hrDeviceAudio',
  '1.3.6.1.2.1.25.3.1.12': 'hrDeviceCoprocessor',
  '1.3.6.1.2.1.25.3.1.13': 'hrDeviceKeyboard',
  '1.3.6.1.2.1.25.3.1.14': 'hrDeviceModem',
  '1.3.6.1.2.1.25.3.1.15': 'hrDeviceParallelPort',
  '1.3.6.1.2.1.25.3.1.16': 'hrDevicePointing',
  '1.3.6.1.2.1.25.3.1.17': 'hrDeviceSerialPort',
  '1.3.6.1.2.1.25.3.1.18': 'hrDeviceTape',
  '1.3.6.1.2.1.25.3.1.19': 'hrDeviceClock',
  '1.3.6.1.2.1.25.3.1.20': 'hrDeviceVolatileMemory',
  '1.3.6.1.2.1.25.3.1.21': 'hrDeviceNonVolatileMemory'
}

/** hrDeviceStatus integer values. */
export const HR_DEVICE_STATUS: Record<number, string> = {
  1: 'unknown', 2: 'running', 3: 'warning', 4: 'testing', 5: 'down'
}

/** Storage-type OIDs worth keeping vs. skipping (hrStorageType values). */
export const HR_STORAGE_TYPES = {
  ram: '1.3.6.1.2.1.25.2.1.2',
  virtualMemory: '1.3.6.1.2.1.25.2.1.3',
  fixedDisk: '1.3.6.1.2.1.25.2.1.4'
} as const

/** UCD-SNMP-MIB (net-snmp agents). */
export const UCD = {
  memTotalSwap: '1.3.6.1.4.1.2021.4.3.0',
  memAvailSwap: '1.3.6.1.4.1.2021.4.4.0',
  memTotalReal: '1.3.6.1.4.1.2021.4.5.0',
  memAvailReal: '1.3.6.1.4.1.2021.4.6.0',
  memBuffer: '1.3.6.1.4.1.2021.4.14.0',
  memCached: '1.3.6.1.4.1.2021.4.15.0',
  laLoad1: '1.3.6.1.4.1.2021.10.1.3.1',
  laLoad5: '1.3.6.1.4.1.2021.10.1.3.2',
  laLoad15: '1.3.6.1.4.1.2021.10.1.3.3',
  ssCpuUser: '1.3.6.1.4.1.2021.11.9.0',
  ssCpuSystem: '1.3.6.1.4.1.2021.11.10.0',
  ssCpuIdle: '1.3.6.1.4.1.2021.11.11.0',
  // lmSensors (LM-SENSORS-MIB under ucdExperimental)
  lmTempSensorsDevice: '1.3.6.1.4.1.2021.13.16.2.1.2',
  lmTempSensorsValue: '1.3.6.1.4.1.2021.13.16.2.1.3',
  lmFanSensorsDevice: '1.3.6.1.4.1.2021.13.16.3.1.2',
  lmFanSensorsValue: '1.3.6.1.4.1.2021.13.16.3.1.3',
  lmVoltSensorsDevice: '1.3.6.1.4.1.2021.13.16.4.1.2',
  lmVoltSensorsValue: '1.3.6.1.4.1.2021.13.16.4.1.3'
} as const

/** ENTITY-MIB physical table. */
export const ENTITY = {
  entPhysicalDescr: '1.3.6.1.2.1.47.1.1.1.1.2',
  entPhysicalContainedIn: '1.3.6.1.2.1.47.1.1.1.1.4',
  entPhysicalClass: '1.3.6.1.2.1.47.1.1.1.1.5',
  entPhysicalName: '1.3.6.1.2.1.47.1.1.1.1.7',
  entPhysicalHardwareRev: '1.3.6.1.2.1.47.1.1.1.1.8',
  entPhysicalFirmwareRev: '1.3.6.1.2.1.47.1.1.1.1.9',
  entPhysicalSoftwareRev: '1.3.6.1.2.1.47.1.1.1.1.10',
  entPhysicalSerialNum: '1.3.6.1.2.1.47.1.1.1.1.11',
  entPhysicalMfgName: '1.3.6.1.2.1.47.1.1.1.1.12',
  entPhysicalModelName: '1.3.6.1.2.1.47.1.1.1.1.13',
  entPhysicalIsFRU: '1.3.6.1.2.1.47.1.1.1.1.16'
} as const

export const ENT_PHYSICAL_CLASSES: Record<number, string> = {
  1: 'other', 2: 'unknown', 3: 'chassis', 4: 'backplane', 5: 'container',
  6: 'powerSupply', 7: 'fan', 8: 'sensor', 9: 'module', 10: 'port', 11: 'stack', 12: 'cpu'
}

/** ENTITY-SENSOR-MIB (RFC 3433). */
export const ENT_SENSOR = {
  entPhySensorType: '1.3.6.1.2.1.99.1.1.1.1',
  entPhySensorScale: '1.3.6.1.2.1.99.1.1.1.2',
  entPhySensorPrecision: '1.3.6.1.2.1.99.1.1.1.3',
  entPhySensorValue: '1.3.6.1.2.1.99.1.1.1.4',
  entPhySensorOperStatus: '1.3.6.1.2.1.99.1.1.1.5'
} as const

/** entPhySensorType → sensor class + unit. */
export const ENT_SENSOR_TYPES: Record<number, { cls: string; unit: string } | null> = {
  1: null, // other
  2: null, // unknown
  3: { cls: 'voltage', unit: 'V' }, // voltsAC
  4: { cls: 'voltage', unit: 'V' }, // voltsDC
  5: { cls: 'current', unit: 'A' }, // amperes
  6: { cls: 'power', unit: 'W' }, // watts
  7: { cls: 'frequency', unit: 'Hz' }, // hertz
  8: { cls: 'temperature', unit: '°C' }, // celsius
  9: { cls: 'humidity', unit: '%' }, // percentRH
  10: { cls: 'fanspeed', unit: 'rpm' }, // rpm
  11: { cls: 'waterflow', unit: 'CMM' }, // cmm
  12: { cls: 'state', unit: '' } // truthvalue
}

/** entPhySensorScale exponent (10^n). */
export const ENT_SENSOR_SCALE: Record<number, number> = {
  1: -24, 2: -21, 3: -18, 4: -15, 5: -12, 6: -9, 7: -6, 8: -3, 9: 0, 10: 3, 11: 6, 12: 9, 13: 12, 14: 15, 15: 18, 16: 21, 17: 24
}

/** BGP4-MIB peer table. */
export const BGP = {
  bgpLocalAs: '1.3.6.1.2.1.15.2.0',
  bgpPeerIdentifier: '1.3.6.1.2.1.15.3.1.1',
  bgpPeerState: '1.3.6.1.2.1.15.3.1.2',
  bgpPeerAdminStatus: '1.3.6.1.2.1.15.3.1.3',
  bgpPeerRemoteAs: '1.3.6.1.2.1.15.3.1.9',
  bgpPeerRemoteAddr: '1.3.6.1.2.1.15.3.1.7',
  bgpPeerInUpdates: '1.3.6.1.2.1.15.3.1.10',
  bgpPeerOutUpdates: '1.3.6.1.2.1.15.3.1.11',
  bgpPeerFsmEstablishedTime: '1.3.6.1.2.1.15.3.1.16'
} as const

export const BGP_PEER_STATES: Record<number, string> = {
  1: 'idle', 2: 'connect', 3: 'active', 4: 'opensent', 5: 'openconfirm', 6: 'established'
}

/** OSPF-MIB. */
export const OSPF = {
  ospfRouterId: '1.3.6.1.2.1.14.1.1.0',
  ospfAdminStat: '1.3.6.1.2.1.14.1.2.0',
  ospfNbrIpAddr: '1.3.6.1.2.1.14.10.1.1',
  ospfNbrRtrId: '1.3.6.1.2.1.14.10.1.3',
  ospfNbrState: '1.3.6.1.2.1.14.10.1.6'
} as const

export const OSPF_NBR_STATES: Record<number, string> = {
  1: 'down', 2: 'attempt', 3: 'init', 4: 'twoWay', 5: 'exchangeStart', 6: 'exchange', 7: 'loading', 8: 'full'
}

/** BRIDGE-MIB + Q-BRIDGE-MIB. */
export const BRIDGE = {
  dot1dBaseBridgeAddress: '1.3.6.1.2.1.17.1.1.0',
  dot1dStpPriority: '1.3.6.1.2.1.17.2.2.0',
  dot1dStpDesignatedRoot: '1.3.6.1.2.1.17.2.5.0',
  dot1dStpRootCost: '1.3.6.1.2.1.17.2.6.0',
  dot1dTpFdbAddress: '1.3.6.1.2.1.17.4.3.1.1',
  dot1dTpFdbPort: '1.3.6.1.2.1.17.4.3.1.2',
  dot1dTpFdbStatus: '1.3.6.1.2.1.17.4.3.1.3',
  dot1dBasePortIfIndex: '1.3.6.1.2.1.17.1.4.1.2',
  // Q-BRIDGE
  dot1qVlanStaticName: '1.3.6.1.2.1.17.7.1.4.3.1.1',
  dot1qVlanFdbId: '1.3.6.1.2.1.17.7.1.4.2.1.3',
  dot1qTpFdbPort: '1.3.6.1.2.1.17.7.1.2.2.1.2'
} as const

/** LLDP-MIB remote table (indexes: timeMark.localPortNum.index). */
export const LLDP = {
  lldpLocPortId: '1.0.8802.1.1.2.1.3.7.1.3',
  lldpRemChassisId: '1.0.8802.1.1.2.1.4.1.1.5',
  lldpRemPortId: '1.0.8802.1.1.2.1.4.1.1.7',
  lldpRemPortDesc: '1.0.8802.1.1.2.1.4.1.1.8',
  lldpRemSysName: '1.0.8802.1.1.2.1.4.1.1.9',
  lldpRemSysDesc: '1.0.8802.1.1.2.1.4.1.1.10'
} as const

/** CISCO-CDP-MIB remote table. */
export const CDP = {
  cdpCacheDeviceId: '1.3.6.1.4.1.9.9.23.1.2.1.1.6',
  cdpCacheDevicePort: '1.3.6.1.4.1.9.9.23.1.2.1.1.7',
  cdpCachePlatform: '1.3.6.1.4.1.9.9.23.1.2.1.1.8',
  cdpCacheAddress: '1.3.6.1.4.1.9.9.23.1.2.1.1.4'
} as const

/** UPS-MIB (RFC 1628). */
export const UPS = {
  upsBatteryStatus: '1.3.6.1.2.1.33.1.2.1.0',
  upsSecondsOnBattery: '1.3.6.1.2.1.33.1.2.2.0',
  upsEstimatedMinutesRemaining: '1.3.6.1.2.1.33.1.2.3.0',
  upsEstimatedChargeRemaining: '1.3.6.1.2.1.33.1.2.4.0',
  upsBatteryVoltage: '1.3.6.1.2.1.33.1.2.5.0',
  upsBatteryTemperature: '1.3.6.1.2.1.33.1.2.7.0',
  upsOutputSource: '1.3.6.1.2.1.33.1.4.1.0',
  upsOutputFrequency: '1.3.6.1.2.1.33.1.4.2.0',
  upsInputLineBads: '1.3.6.1.2.1.33.1.3.1.0'
} as const

/** Printer-MIB supplies. */
export const PRINTER = {
  prtMarkerSuppliesDescription: '1.3.6.1.2.1.43.11.1.1.6',
  prtMarkerSuppliesLevel: '1.3.6.1.2.1.43.11.1.1.9',
  prtMarkerSuppliesMaxCapacity: '1.3.6.1.2.1.43.11.1.1.8',
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4'
} as const

/** SNMPv2 trap OIDs (generic traps). */
export const TRAPS = {
  coldStart: '1.3.6.1.6.3.1.1.5.1',
  warmStart: '1.3.6.1.6.3.1.1.5.2',
  linkDown: '1.3.6.1.6.3.1.1.5.3',
  linkUp: '1.3.6.1.6.3.1.1.5.4',
  authenticationFailure: '1.3.6.1.6.3.1.1.5.5',
  snmpTrapOID: '1.3.6.1.6.3.1.1.4.1.0',
  sysUpTimeInstance: '1.3.6.1.2.1.1.3.0'
} as const

export const IF_OPER_STATUS: Record<number, string> = {
  1: 'up', 2: 'down', 3: 'testing', 4: 'unknown', 5: 'dormant', 6: 'notPresent', 7: 'lowerLayerDown'
}
export const IF_ADMIN_STATUS: Record<number, string> = { 1: 'up', 2: 'down', 3: 'testing' }
