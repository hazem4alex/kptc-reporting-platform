import pg from "pg";
import { hashPassword } from "./auth.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

const operationalDataCutoffDate = "2026-07-01";
const configuredDeviceTimeOffset = Number(process.env.DEVICE_TIME_OFFSET_HOURS ?? -5);
const deviceTimeOffsetHours = Number.isFinite(configuredDeviceTimeOffset)
  ? configuredDeviceTimeOffset
  : -5;

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id text PRIMARY KEY,
      bus_no text NULL,
      route_no text NULL,
      route_name text NULL,
      route_extra jsonb NULL,
      description text NULL,
      created_at timestamptz DEFAULT now(),
      last_seen_at timestamptz NULL
    );

    ALTER TABLE devices ADD COLUMN IF NOT EXISTS bus_no text NULL;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS route_no text NULL;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS route_name text NULL;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS route_extra jsonb NULL;

    CREATE TABLE IF NOT EXISTS routes (
      id text PRIMARY KEY,
      route_code text UNIQUE NOT NULL,
      route_name text NOT NULL,
      fare_fils int NOT NULL CHECK (fare_fils >= 0),
      start_station_id text NULL,
      end_station_id text NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      deleted_at timestamptz NULL
    );

    CREATE TABLE IF NOT EXISTS stations (
      id text PRIMARY KEY,
      name_en text NOT NULL,
      name_ar text NULL,
      longitude numeric(10,7) NULL,
      latitude numeric(10,7) NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    );

    ALTER TABLE routes ADD COLUMN IF NOT EXISTS start_station_id text NULL;
    ALTER TABLE routes ADD COLUMN IF NOT EXISTS end_station_id text NULL;
    ALTER TABLE routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

    CREATE TABLE IF NOT EXISTS buses (
      id text PRIMARY KEY,
      bus_code text UNIQUE NOT NULL,
      plate_number text NULL,
      device_id text UNIQUE NOT NULL REFERENCES devices(device_id),
      active_route_id text NULL REFERENCES routes(id),
      route_config_version int NOT NULL DEFAULT 1,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      deleted_at timestamptz NULL
    );

    ALTER TABLE buses ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE buses ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

    CREATE TABLE IF NOT EXISTS route_change_logs (
      id bigserial PRIMARY KEY,
      bus_id text NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
      old_route_id text NULL REFERENCES routes(id),
      new_route_id text NULL REFERENCES routes(id),
      old_fare_fils int NULL,
      new_fare_fils int NULL,
      changed_by text NULL,
      old_device_id text NULL,
      new_device_id text NULL,
      old_bus_number text NULL,
      new_bus_number text NULL,
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE buses ALTER COLUMN route_config_version SET DEFAULT 1;
    UPDATE buses SET route_config_version = 1 WHERE route_config_version IS NULL OR route_config_version < 1;
    ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS old_device_id text NULL;
    ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS new_device_id text NULL;
    ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS old_bus_number text NULL;
    ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS new_bus_number text NULL;

    CREATE TABLE IF NOT EXISTS card_type_definitions (
      card_type text PRIMARY KEY,
      is_driver_card boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id text PRIMARY KEY,
      name_en text NOT NULL,
      name_ar text NULL,
      phone_number text NULL,
      civil_id text UNIQUE NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    );

    CREATE TABLE IF NOT EXISTS driver_cards (
      card_no text PRIMARY KEY,
      driver_id text NOT NULL REFERENCES drivers(id),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id bigserial PRIMARY KEY,
      record_uid text UNIQUE NOT NULL,
      device_id text NOT NULL REFERENCES devices(device_id),
      record_index int,
      sequence_no text,
      card_no text,
      card_type text,
      card_expiry text,
      counter text,
      balance_raw bigint,
      balance_display_kwd numeric(12,3),
      amount_raw bigint,
      amount_display_kwd numeric(12,3),
      amount_copy_raw bigint,
      transaction_datetime timestamptz,
      transaction_datetime_raw text,
      record_type text,
      sub_type text,
      crc text,
      source_file text,
      scan_lat numeric(10,7),
      scan_lng numeric(10,7),
      scan_location_source text,
      scan_location_accuracy text,
      scan_location_time timestamptz,
      payload jsonb,
      received_at timestamptz DEFAULT now()
    );

    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scan_lat numeric(10,7) NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scan_lng numeric(10,7) NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scan_location_source text NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scan_location_accuracy text NULL;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scan_location_time timestamptz NULL;

    INSERT INTO card_type_definitions (card_type, is_driver_card)
    VALUES ('0500', true)
    ON CONFLICT (card_type) DO NOTHING;

    INSERT INTO card_type_definitions (card_type)
    SELECT DISTINCT card_type
    FROM transactions
    WHERE card_type IS NOT NULL AND btrim(card_type) <> ''
    ON CONFLICT (card_type) DO NOTHING;

    CREATE TABLE IF NOT EXISTS bus_locations (
      id bigserial PRIMARY KEY,
      device_id text NOT NULL,
      bus_no text NULL,
      lat numeric(10,7),
      lng numeric(10,7),
      speed numeric(10,3),
      bearing numeric(10,3),
      source text,
      location_time timestamptz,
      received_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sync_batches (
      id bigserial PRIMARY KEY,
      device_id text NOT NULL,
      source_file text,
      record_count int,
      last_uploaded_count int,
      new_count int,
      accepted int,
      duplicates int,
      received int,
      created_at timestamptz DEFAULT now(),
      payload jsonb
    );

    CREATE TABLE IF NOT EXISTS app_users (
      id bigserial PRIMARY KEY,
      username text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'viewer',
      display_name text NULL,
      created_at timestamptz DEFAULT now(),
      last_login_at timestamptz NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token text PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      expires_at timestamptz NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_device_id ON transactions(device_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_transaction_datetime ON transactions(transaction_datetime DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_no ON transactions(card_no);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_type ON transactions(card_type);
    CREATE INDEX IF NOT EXISTS idx_transactions_driver_events
      ON transactions(card_type, record_type, transaction_datetime DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_scan_location
      ON transactions(device_id, scan_location_time DESC)
      WHERE scan_lat IS NOT NULL AND scan_lng IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_received_at ON transactions(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bus_locations_device_time ON bus_locations(device_id, location_time DESC, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_batches_device_created ON sync_batches(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_buses_device_id ON buses(device_id);
    CREATE INDEX IF NOT EXISTS idx_buses_active_route_id ON buses(active_route_id);
    CREATE INDEX IF NOT EXISTS idx_route_change_logs_bus_created ON route_change_logs(bus_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_routes_start_station_id ON routes(start_station_id);
    CREATE INDEX IF NOT EXISTS idx_routes_end_station_id ON routes(end_station_id);
    CREATE INDEX IF NOT EXISTS idx_driver_cards_driver_id ON driver_cards(driver_id);
  `);

  await purgePreCutoffOperationalData();
  await seedAdminUser();
  await seedRoutesAndBuses();
}

async function purgePreCutoffOperationalData() {
  await pool.query(
    `
      DELETE FROM transactions
      WHERE COALESCE(
        CASE
          WHEN transaction_datetime_raw ~ '^\\d{14}$' THEN
            (
              make_timestamp(
                substring(transaction_datetime_raw from 1 for 4)::int,
                substring(transaction_datetime_raw from 5 for 2)::int,
                substring(transaction_datetime_raw from 7 for 2)::int,
                substring(transaction_datetime_raw from 9 for 2)::int,
                substring(transaction_datetime_raw from 11 for 2)::int,
                substring(transaction_datetime_raw from 13 for 2)::int
              ) + ($2::int * interval '1 hour')
            )::date
          ELSE NULL
        END,
        (transaction_datetime AT TIME ZONE 'Asia/Kuwait')::date,
        (received_at AT TIME ZONE 'Asia/Kuwait')::date
      ) < $1::date
    `,
    [operationalDataCutoffDate, deviceTimeOffsetHours]
  );

  await pool.query(
    `
      DELETE FROM bus_locations
      WHERE COALESCE(
        (location_time AT TIME ZONE 'Asia/Kuwait')::date,
        (received_at AT TIME ZONE 'Asia/Kuwait')::date
      ) < $1::date
    `,
    [operationalDataCutoffDate]
  );
}

async function seedAdminUser() {
  const existing = await pool.query("SELECT id FROM app_users WHERE username = $1", ["admin"]);
  if (existing.rowCount > 0) return;

  await pool.query(
    `
      INSERT INTO app_users (username, password_hash, role, display_name)
      VALUES ($1, $2, $3, $4)
    `,
    ["admin", hashPassword("Admin@123"), "admin", "System Administrator"]
  );
}

async function seedRoutesAndBuses() {
  await pool.query(
    `
      INSERT INTO routes (id, route_code, route_name, fare_fils, is_active)
      VALUES
        ('R12', '12', 'Murqab', 250, true),
        ('R15', '15', 'Route 15 - Kuwait City', 300, true),
        ('R20', '20', 'Route 20 - Farwaniya', 200, true)
      ON CONFLICT (id) DO NOTHING
    `
  );

  await pool.query(
    `
      INSERT INTO devices (device_id, bus_no, route_no, route_name)
      VALUES
        ('E60_TEST_001', 'BUS-101', '12', 'Route 12 - Salmiya'),
        ('E60_TEST_002', 'BUS-102', '20', 'Route 20 - Farwaniya')
      ON CONFLICT (device_id) DO NOTHING
    `
  );

  await pool.query(
    `
      INSERT INTO devices (device_id, bus_no, route_no, route_name)
      VALUES ('90010012', '90010011', '12', 'Murqab')
      ON CONFLICT (device_id) DO UPDATE SET
        bus_no = COALESCE(devices.bus_no, EXCLUDED.bus_no),
        route_no = COALESCE(devices.route_no, EXCLUDED.route_no),
        route_name = COALESCE(devices.route_name, EXCLUDED.route_name)
    `
  );

  await pool.query(
    `
      INSERT INTO buses (id, bus_code, plate_number, device_id, active_route_id, route_config_version)
      VALUES
        ('BUS-101', 'BUS-101', 'KPTC-101', 'E60_TEST_001', 'R12', 1),
        ('BUS-102', 'BUS-102', 'KPTC-102', 'E60_TEST_002', 'R20', 1)
      ON CONFLICT (id) DO NOTHING
    `
  );

  await pool.query(
    `
      INSERT INTO buses (id, bus_code, device_id, active_route_id, route_config_version)
      VALUES ('90010011', '90010011', '90010012', 'R12', 1)
      ON CONFLICT (id) DO NOTHING
    `
  );
}
