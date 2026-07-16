# Health & Wireless Sensor Class Parity

## Health sensor classes (`shared/constants.ts` `SENSOR_CLASSES`)

| Class | Status | Source |
|---|---|---|
| temperature | **Complete** | ENTITY-SENSOR, LM-SENSORS |
| voltage | **Complete** | ENTITY-SENSOR, LM-SENSORS |
| current | **Complete** | ENTITY-SENSOR |
| power | **Complete** | ENTITY-SENSOR |
| power_consumed | **Blocked** | No mapped OID source yet |
| power_factor | **Blocked** | No mapped OID source yet |
| frequency | **Complete** | ENTITY-SENSOR |
| humidity | **Complete** | ENTITY-SENSOR |
| fanspeed | **Complete** | ENTITY-SENSOR, LM-SENSORS |
| waterflow | **Complete** | ENTITY-SENSOR (cmm) |
| state | **Complete** | ENTITY-SENSOR truthvalue, UPS-MIB enums with `state_translations` |
| percent | **Complete** | Printer-MIB supplies expressed as percent |
| runtime | **Complete** | UPS-MIB `upsEstimatedMinutesRemaining` |
| charge | **Complete** | UPS-MIB `upsEstimatedChargeRemaining` |
| count | **Blocked** | No generic mapped source yet |
| load | **Blocked** | No generic mapped source (distinct from processor usage_percent) |
| loss | **Blocked** | No mapped OID source yet |
| pressure | **Blocked** | No mapped OID source yet |
| dbm (optical/radio power) | **Blocked** | Requires vendor optics MIBs (e.g. Cisco/Juniper DOM) not yet mapped |
| signal / snr | **Blocked** | Wireless-class equivalents exist (`wireless_sensors`); generic health-class versions not mapped |
| signal_loss | **Blocked** | Not mapped |
| ber (bit error rate) | **Blocked** | Not mapped |
| bitrate | **Blocked** | Not mapped |
| chromatic_dispersion | **Blocked** | Vendor-specific optical MIBs, not mapped |
| cooling | **Blocked** | Not mapped |
| delay | **Blocked** | Not mapped |
| eer (energy-efficiency ratio) | **Blocked** | Not mapped |
| quality_factor | **Blocked** | Not mapped |
| tv_signal | **Blocked** | Not applicable to typical network/server hardware; no source identified |

Sensor definitions support (per the mandate): scalar/table OID, compound
index, description, group, unit, divisor, multiplier, warn/crit low/high,
state mappings, entity relationship, OS-specific overrides via
`disabledModules`, device-specific overrides via `module_settings`. **Not
yet supported**: value-match/OID-existence skip conditions and user-defined
transformation functions beyond the built-in divisor/multiplier/scale math —
tracked as **Partially complete** on the sensor-definition framework itself.

## Wireless sensor classes (`WIRELESS_CLASSES`)

All classes are defined in `shared/constants.ts` and the
`monitoring.wireless_sensors` table is ready to receive data (see
`feature-parity.md` §5), but **no discovery/poller module populates any of
them yet** — every class below is **Blocked** pending a
vendor-wireless-controller MIB mapping:

ap-count, capacity, ccq, channel, cell, clients, distance, error-rate,
error-ratio, errors, frequency, mse, noise-floor, power, quality, rate,
rssi, snr, sinr, rsrq, rsrp, xpi, ssr, utilization.
