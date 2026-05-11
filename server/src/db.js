import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id text PRIMARY KEY,
      bus_no text NULL,
      route_no text NULL,
      description text NULL,
      created_at timestamptz DEFAULT now(),
      last_seen_at timestamptz NULL
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
      payload jsonb,
      received_at timestamptz DEFAULT now()
    );

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

    CREATE INDEX IF NOT EXISTS idx_transactions_device_id ON transactions(device_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_transaction_datetime ON transactions(transaction_datetime DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_no ON transactions(card_no);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_type ON transactions(card_type);
    CREATE INDEX IF NOT EXISTS idx_transactions_received_at ON transactions(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bus_locations_device_time ON bus_locations(device_id, location_time DESC, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_batches_device_created ON sync_batches(device_id, created_at DESC);
  `);
}
