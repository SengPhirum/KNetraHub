import { describe, it, expect } from 'vitest'
import { resolveOidName, isValidOid } from '../../server/snmp/mibNames'
import { SNMP_CAPTURE_PRESETS } from '../../shared/constants'

describe('resolveOidName', () => {
  it('resolves exact scalar OIDs', () => {
    expect(resolveOidName('1.3.6.1.2.1.1.1.0')).toBe('SNMPv2-MIB::sysDescr')
    expect(resolveOidName('1.3.6.1.2.1.1.5.0')).toBe('SNMPv2-MIB::sysName')
  })

  it('resolves table cells to name.index via longest prefix', () => {
    expect(resolveOidName('1.3.6.1.2.1.2.2.1.2.3')).toBe('IF-MIB::ifDescr.3')
    expect(resolveOidName('1.3.6.1.2.1.31.1.1.1.6.10')).toBe('IF-MIB::ifHCInOctets.10')
    expect(resolveOidName('1.3.6.1.2.1.25.2.3.1.5.1')).toBe('HOST-RESOURCES-MIB::hrStorageSize.1')
  })

  it('keeps compound indexes intact', () => {
    expect(resolveOidName('1.3.6.1.2.1.4.22.1.2.1.10.0.0.1')).toBe('IP-MIB::ipNetToMediaPhysAddress.1.10.0.0.1')
  })

  it('tolerates a leading dot', () => {
    expect(resolveOidName('.1.3.6.1.2.1.1.3.0')).toBe('SNMPv2-MIB::sysUpTime')
  })

  it('returns null for unknown OIDs', () => {
    expect(resolveOidName('1.3.6.1.4.1.99999.1.2.3')).toBeNull()
  })
})

describe('isValidOid', () => {
  it('accepts numeric OIDs with and without leading dot', () => {
    expect(isValidOid('1.3.6.1.2.1')).toBe(true)
    expect(isValidOid('.1.3.6.1.2.1.1.1.0')).toBe(true)
  })

  it('rejects non-numeric, empty and oversized input', () => {
    expect(isValidOid('')).toBe(false)
    expect(isValidOid('1')).toBe(false) // single arc is not a usable OID
    expect(isValidOid('sysDescr.0')).toBe(false)
    expect(isValidOid('1.3.6;drop table')).toBe(false)
    expect(isValidOid('1.' + '1.'.repeat(200) + '1')).toBe(false)
  })
})

describe('SNMP_CAPTURE_PRESETS', () => {
  it('every preset carries a valid base OID and unique value', () => {
    const values = new Set<string>()
    for (const preset of SNMP_CAPTURE_PRESETS) {
      expect(isValidOid(preset.oid)).toBe(true)
      expect(values.has(preset.value)).toBe(false)
      values.add(preset.value)
    }
  })
})
