import type { Migration } from './types'

/**
 * Time-series metric storage (TimescaleDB hypertables) + continuous
 * aggregates for the common graph windows. Retention/compression policies are
 * applied by housekeeping using monitoring.settings overrides, with defaults
 * installed here (tolerant: editions without the policies still work).
 *
 * Three tables instead of one generic EAV monster:
 *  - port_metrics: fixed, hot columns for interface graphs (the highest volume)
 *  - sensor_metrics: one value per sensor per poll
 *  - metrics: generic series for everything else (processors, mempools,
 *    storage, bgp, wireless, applications) keyed by metric name + entity.
 */
export const migration: Migration = {
  id: '0005_metrics',
  statements: [
    `CREATE TABLE IF NOT EXISTS monitoring.port_metrics (
      time TIMESTAMPTZ NOT NULL,
      port_id BIGINT NOT NULL,
      device_id BIGINT NOT NULL,
      in_bps DOUBLE PRECISION, out_bps DOUBLE PRECISION,
      in_pps DOUBLE PRECISION, out_pps DOUBLE PRECISION,
      in_errors_ps DOUBLE PRECISION, out_errors_ps DOUBLE PRECISION,
      in_discards_ps DOUBLE PRECISION, out_discards_ps DOUBLE PRECISION,
      in_util_percent DOUBLE PRECISION, out_util_percent DOUBLE PRECISION,
      in_octets_delta NUMERIC, out_octets_delta NUMERIC
    )`,
    `SELECT create_hypertable('monitoring.port_metrics', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_port_metrics ON monitoring.port_metrics (port_id, time DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.sensor_metrics (
      time TIMESTAMPTZ NOT NULL,
      sensor_id BIGINT NOT NULL,
      device_id BIGINT NOT NULL,
      value DOUBLE PRECISION
    )`,
    `SELECT create_hypertable('monitoring.sensor_metrics', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_sensor_metrics ON monitoring.sensor_metrics (sensor_id, time DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.metrics (
      time TIMESTAMPTZ NOT NULL,
      device_id BIGINT NOT NULL,
      metric TEXT NOT NULL,              -- e.g. processor_usage, mempool_used, bgp_prefixes
      entity_type TEXT NOT NULL,         -- processor|mempool|storage|bgp_peer|wireless_sensor|device|service|application
      entity_id BIGINT NOT NULL DEFAULT 0,
      value DOUBLE PRECISION,
      labels JSONB
    )`,
    `SELECT create_hypertable('monitoring.metrics', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_metrics ON monitoring.metrics (device_id, metric, entity_id, time DESC)`,

    `CREATE TABLE IF NOT EXISTS monitoring.service_results (
      time TIMESTAMPTZ NOT NULL,
      service_id BIGINT NOT NULL,
      device_id BIGINT,
      status TEXT NOT NULL,              -- ok|warning|critical|unknown
      response_ms DOUBLE PRECISION,
      message TEXT,
      perf JSONB
    )`,
    `SELECT create_hypertable('monitoring.service_results', 'time', if_not_exists => TRUE)`,
    `CREATE INDEX IF NOT EXISTS idx_mon_service_results ON monitoring.service_results (service_id, time DESC)`,

    // Continuous aggregates for common graph periods (1h..1y renders read
    // the 5m/1h rollups instead of raw samples).
    `CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.port_metrics_5m
      WITH (timescaledb.continuous) AS
      SELECT time_bucket('5 minutes', time) AS bucket, port_id, device_id,
        avg(in_bps) AS in_bps_avg, max(in_bps) AS in_bps_max,
        avg(out_bps) AS out_bps_avg, max(out_bps) AS out_bps_max,
        avg(in_util_percent) AS in_util_avg, avg(out_util_percent) AS out_util_avg,
        avg(in_errors_ps) AS in_errors_ps_avg, avg(out_errors_ps) AS out_errors_ps_avg,
        sum(in_octets_delta) AS in_octets, sum(out_octets_delta) AS out_octets
      FROM monitoring.port_metrics GROUP BY bucket, port_id, device_id
      WITH NO DATA`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.port_metrics_1h
      WITH (timescaledb.continuous) AS
      SELECT time_bucket('1 hour', time) AS bucket, port_id, device_id,
        avg(in_bps) AS in_bps_avg, max(in_bps) AS in_bps_max,
        avg(out_bps) AS out_bps_avg, max(out_bps) AS out_bps_max,
        avg(in_util_percent) AS in_util_avg, avg(out_util_percent) AS out_util_avg,
        sum(in_octets_delta) AS in_octets, sum(out_octets_delta) AS out_octets
      FROM monitoring.port_metrics GROUP BY bucket, port_id, device_id
      WITH NO DATA`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.sensor_metrics_5m
      WITH (timescaledb.continuous) AS
      SELECT time_bucket('5 minutes', time) AS bucket, sensor_id, device_id,
        avg(value) AS value_avg, min(value) AS value_min, max(value) AS value_max
      FROM monitoring.sensor_metrics GROUP BY bucket, sensor_id, device_id
      WITH NO DATA`,
    `CREATE MATERIALIZED VIEW IF NOT EXISTS monitoring.metrics_5m
      WITH (timescaledb.continuous) AS
      SELECT time_bucket('5 minutes', time) AS bucket, device_id, metric, entity_type, entity_id,
        avg(value) AS value_avg, min(value) AS value_min, max(value) AS value_max
      FROM monitoring.metrics GROUP BY bucket, device_id, metric, entity_type, entity_id
      WITH NO DATA`,

    // Refresh policies (tolerant — manual refresh still possible without them)
    `SELECT add_continuous_aggregate_policy('monitoring.port_metrics_5m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE)`,
    `SELECT add_continuous_aggregate_policy('monitoring.port_metrics_1h', start_offset => INTERVAL '3 hours', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE)`,
    `SELECT add_continuous_aggregate_policy('monitoring.sensor_metrics_5m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE)`,
    `SELECT add_continuous_aggregate_policy('monitoring.metrics_5m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE)`,

    // Compression on the hottest table (tolerant)
    `ALTER TABLE monitoring.port_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'port_id', timescaledb.compress_orderby = 'time DESC')`,
    `SELECT add_compression_policy('monitoring.port_metrics', INTERVAL '3 days', if_not_exists => TRUE)`
  ],
  tolerant: [
    'create_hypertable', 'timescaledb.continuous', 'add_continuous_aggregate_policy',
    'timescaledb.compress', 'add_compression_policy'
  ]
}
