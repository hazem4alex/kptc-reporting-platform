BEGIN;

ALTER TABLE buses ADD COLUMN IF NOT EXISTS route_config_version integer;
UPDATE buses SET route_config_version = 1
WHERE route_config_version IS NULL OR route_config_version < 1;
ALTER TABLE buses ALTER COLUMN route_config_version SET DEFAULT 1;
ALTER TABLE buses ALTER COLUMN route_config_version SET NOT NULL;

ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS old_device_id text;
ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS new_device_id text;
ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS old_bus_number text;
ALTER TABLE route_change_logs ADD COLUMN IF NOT EXISTS new_bus_number text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_routes_route_code ON routes(route_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_buses_bus_code ON buses(bus_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_buses_device_id ON buses(device_id);
CREATE INDEX IF NOT EXISTS idx_buses_active_route_id ON buses(active_route_id);
CREATE INDEX IF NOT EXISTS idx_route_change_logs_bus_created
  ON route_change_logs(bus_id, created_at DESC);

INSERT INTO routes (id, route_code, route_name, fare_fils, is_active)
VALUES ('R12', '12', 'Murqab', 250, true)
ON CONFLICT (route_code) DO NOTHING;

-- Upgrade only the project's original sample row; never overwrite an administrator's custom route.
UPDATE routes
SET route_name = 'Murqab', updated_at = now()
WHERE route_code = '12'
  AND route_name = 'Route 12 - Salmiya'
  AND fare_fils = 250;

INSERT INTO devices (device_id, bus_no, route_no, route_name)
VALUES ('90010012', '90010011', '12', 'Murqab')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO buses (id, bus_code, device_id, active_route_id, route_config_version)
SELECT '90010011', '90010011', '90010012', r.id, 1
FROM routes r
WHERE r.route_code = '12'
  AND NOT EXISTS (
    SELECT 1 FROM buses b
    WHERE b.id = '90010011' OR b.bus_code = '90010011' OR b.device_id = '90010012'
  );

COMMIT;
