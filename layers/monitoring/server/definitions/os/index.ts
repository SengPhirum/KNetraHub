import { defineOs } from '../../core/registry'

/**
 * Built-in operating-system definitions (clean-room, keyed on public
 * sysObjectID enterprise arcs + sysDescr patterns). The set below covers the
 * most common device families; unlisted devices fall back to 'generic' and
 * still get full standard-MIB collection (IF/HR/UCD/ENTITY/BRIDGE/…).
 *
 * Adding an OS = one defineOs() call; never an if/else in engine code.
 * Coverage status vs LibreNMS's OS library is tracked in the parity matrix.
 */

defineOs({
  os: 'generic',
  deviceType: 'appliance',
  text: 'Generic SNMP device',
  priority: -100
})

defineOs({
  os: 'ping',
  deviceType: 'appliance',
  text: 'ICMP-only device',
  priority: -100
})

defineOs({
  os: 'linux',
  deviceType: 'server',
  text: 'Linux',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.8072.3.2.10'],
  sysDescrPatterns: [/^Linux /],
  parseSysDescr: (sd) => {
    const m = sd.match(/^Linux \S+ (\S+)/)
    return { version: m?.[1] }
  }
})

defineOs({
  os: 'windows',
  deviceType: 'server',
  text: 'Microsoft Windows',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.311.1.1.3'],
  sysDescrPatterns: [/Windows/i, /Hardware:.*Software: Windows/i]
})

defineOs({
  os: 'freebsd',
  deviceType: 'server',
  text: 'FreeBSD',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.8072.3.2.8'],
  sysDescrPatterns: [/^FreeBSD/i]
})

defineOs({
  os: 'ios',
  deviceType: 'network',
  text: 'Cisco IOS',
  vendor: 'Cisco',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.9.1'],
  sysDescrPatterns: [/Cisco IOS Software/i, /Cisco Internetwork Operating System/i],
  parseSysDescr: (sd) => {
    const version = sd.match(/Version ([^,\s]+)/i)?.[1]
    return { version }
  }
})

defineOs({
  os: 'iosxe',
  deviceType: 'network',
  text: 'Cisco IOS-XE',
  vendor: 'Cisco',
  sysDescrPatterns: [/IOS-XE/i],
  priority: 10,
  parseSysDescr: (sd) => ({ version: sd.match(/Version ([^,\s]+)/i)?.[1] })
})

defineOs({
  os: 'nxos',
  deviceType: 'network',
  text: 'Cisco NX-OS',
  vendor: 'Cisco',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.9.12.3.1'],
  sysDescrPatterns: [/NX-OS/i],
  priority: 10
})

defineOs({
  os: 'junos',
  deviceType: 'network',
  text: 'Juniper Junos',
  vendor: 'Juniper',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.2636.1'],
  sysDescrPatterns: [/JUNOS/i],
  parseSysDescr: (sd) => ({ version: sd.match(/JUNOS ([^\s,]+)/i)?.[1] })
})

defineOs({
  os: 'arista-eos',
  deviceType: 'network',
  text: 'Arista EOS',
  vendor: 'Arista',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.30065.1'],
  sysDescrPatterns: [/Arista Networks EOS/i]
})

defineOs({
  os: 'routeros',
  deviceType: 'network',
  text: 'MikroTik RouterOS',
  vendor: 'MikroTik',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.14988.1'],
  sysDescrPatterns: [/RouterOS/i]
})

defineOs({
  os: 'fortigate',
  deviceType: 'firewall',
  text: 'Fortinet FortiGate',
  vendor: 'Fortinet',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.12356.101.1'],
  sysDescrPatterns: [/FortiGate/i]
})

defineOs({
  os: 'panos',
  deviceType: 'firewall',
  text: 'Palo Alto PAN-OS',
  vendor: 'Palo Alto Networks',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.25461.2.3'],
  sysDescrPatterns: [/Palo Alto Networks/i]
})

defineOs({
  os: 'procurve',
  deviceType: 'network',
  text: 'HPE ProCurve/Aruba Switch',
  vendor: 'HPE',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.11.2.3.7.11'],
  sysDescrPatterns: [/ProCurve|Aruba JL/i]
})

defineOs({
  os: 'arubaos',
  deviceType: 'wireless',
  text: 'ArubaOS (Wireless Controller)',
  vendor: 'HPE Aruba',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.14823.1.1'],
  sysDescrPatterns: [/ArubaOS/i]
})

defineOs({
  os: 'dsm',
  deviceType: 'storage',
  text: 'Synology DSM',
  vendor: 'Synology',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.6574'],
  sysDescrPatterns: [/DSM|Synology/i]
})

defineOs({
  os: 'vmware-esxi',
  deviceType: 'server',
  text: 'VMware ESXi',
  vendor: 'VMware',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.6876.4.1'],
  sysDescrPatterns: [/VMware ESX/i]
})

defineOs({
  os: 'apc-ups',
  deviceType: 'power',
  text: 'APC UPS (PowerNet)',
  vendor: 'APC',
  sysObjectIdPrefixes: ['1.3.6.1.4.1.318.1.3'],
  sysDescrPatterns: [/APC (Web\/SNMP|Network Management)/i],
  disabledModules: { discovery: ['bgp', 'ospf', 'fdb', 'vlans', 'stp'], poll: ['bgp', 'ospf'] }
})

defineOs({
  os: 'printer',
  deviceType: 'appliance',
  text: 'Network printer (Printer-MIB)',
  // No universal enterprise arc: detection happens in the core module when
  // the Printer-MIB supplies table responds (capability probe), or by common
  // vendor arcs below.
  sysObjectIdPrefixes: [
    '1.3.6.1.4.1.11.2.3.9', // HP LaserJet
    '1.3.6.1.4.1.1602',     // Canon
    '1.3.6.1.4.1.641',      // Lexmark
    '1.3.6.1.4.1.2435'      // Brother
  ],
  disabledModules: { discovery: ['bgp', 'ospf', 'fdb', 'vlans', 'stp'], poll: ['bgp', 'ospf'] }
})

defineOs({
  os: 'opnsense',
  deviceType: 'firewall',
  text: 'OPNsense',
  sysDescrPatterns: [/OPNsense/i],
  priority: 10
})

defineOs({
  os: 'pfsense',
  deviceType: 'firewall',
  text: 'pfSense',
  sysDescrPatterns: [/pfSense/i],
  priority: 10
})
