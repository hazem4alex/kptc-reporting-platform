BEGIN;

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

ALTER TABLE buses ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

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

CREATE INDEX IF NOT EXISTS idx_routes_start_station_id ON routes(start_station_id);
CREATE INDEX IF NOT EXISTS idx_routes_end_station_id ON routes(end_station_id);
CREATE INDEX IF NOT EXISTS idx_driver_cards_driver_id ON driver_cards(driver_id);

COMMIT;
