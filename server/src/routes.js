import express from "express";
import { createToken, hashPassword, verifyPassword } from "./auth.js";
import { pool } from "./db.js";
import { requireApiKey, requireAuth } from "./middleware.js";
import { applyMoneyScale, formatFareKwd, parseDateTime, parseNumeric, parsePositiveInt, parseRawWithOffset, requiredString } from "./utils.js";

export const router = express.Router();

const configuredDeviceTimeOffset = Number(process.env.DEVICE_TIME_OFFSET_HOURS ?? -5);
const deviceTimeOffsetHours = Number.isFinite(configuredDeviceTimeOffset)
  ? configuredDeviceTimeOffset
  : -5;

function parseNonNegativeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    const err = new Error(`${fieldName} must be a non-negative integer`);
    err.statusCode = 400;
    throw err;
  }
  return number;
}

function routeIdFromCode(routeCode) {
  const normalized = String(routeCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `R${normalized || Date.now()}`;
}

function idFromValue(prefix, value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${prefix}${normalized || `${Date.now()}${Math.floor(Math.random() * 1000)}`}`;
}

function requireAdminUser(req) {
  if (req.user?.role !== "admin") {
    const err = new Error("Admin role is required");
    err.statusCode = 403;
    throw err;
  }
}

function routeResponse(row) {
  return row ? {
    ...row,
    fare_fils: Number(row.fare_fils),
    fare_kwd: formatFareKwd(row.fare_fils)
  } : row;
}

function busResponse(row) {
  if (!row) return row;
  const fareFils = row.fare_fils == null ? null : Number(row.fare_fils);
  return {
    ...row,
    bus_number: row.bus_number ?? row.bus_code,
    active_route_code: row.active_route_code ?? row.route_code ?? null,
    active_route_name: row.active_route_name ?? row.route_name ?? null,
    fare_fils: fareFils,
    fare_kwd: formatFareKwd(fareFils)
  };
}

function normalizeLocation(input = {}) {
  if (!input || typeof input !== "object") {
    return { lat: null, lng: null, source: null, accuracy: null, locationTime: null, speed: null, bearing: null };
  }

  return {
    lat: parseNumeric(input.lat ?? input.latitude),
    lng: parseNumeric(input.lng ?? input.lon ?? input.longitude),
    source: input.source == null ? null : String(input.source),
    accuracy: input.accuracy == null ? null : String(input.accuracy),
    locationTime: parseDateTime(input.location_time ?? input.gps_time ?? input.time ?? input.timestamp),
    speed: parseNumeric(input.speed),
    bearing: parseNumeric(input.bearing)
  };
}

function transactionLocation(batchLocation, tx = {}) {
  const txLocation = normalizeLocation(tx.location);
  const explicitTxLocationTime = parseDateTime(tx.location_time);
  const transactionTime = parseDateTime(tx.transaction_datetime);

  return {
    lat: txLocation.lat ?? batchLocation.lat,
    lng: txLocation.lng ?? batchLocation.lng,
    source: txLocation.source ?? batchLocation.source,
    accuracy: txLocation.accuracy ?? batchLocation.accuracy,
    locationTime:
      txLocation.locationTime ??
      explicitTxLocationTime ??
      batchLocation.locationTime ??
      transactionTime,
    speed: txLocation.speed ?? batchLocation.speed,
    bearing: txLocation.bearing ?? batchLocation.bearing
  };
}

const rawWithDeviceOffsetSql = `
  CASE
    WHEN transaction_datetime_raw ~ '^\\d{14}$' THEN
      make_timestamp(
        substring(transaction_datetime_raw from 1 for 4)::int,
        substring(transaction_datetime_raw from 5 for 2)::int,
        substring(transaction_datetime_raw from 7 for 2)::int,
        substring(transaction_datetime_raw from 9 for 2)::int,
        substring(transaction_datetime_raw from 11 for 2)::int,
        substring(transaction_datetime_raw from 13 for 2)::int
      ) + (${deviceTimeOffsetHours} * interval '1 hour')
    ELSE NULL
  END
`;

router.get("/", (req, res) => {
  res.json({
    success: true,
    service: "KPTC Reporting API",
    status: "ok",
    endpoints: {
      health: "/health",
      summary: "/api/reports/summary",
      daily: "/api/reports/daily",
      devices: "/api/reports/devices",
      transactions: "/api/reports/transactions",
      cardTypes: "/api/reports/card-types",
      driverEvents: "/api/reports/driver-events",
      latestBusLocations: "/api/reports/bus-locations/latest"
    }
  });
});

router.get("/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, status: "ok" });
  } catch (err) {
    next(err);
  }
});

router.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = requiredString(req.body?.username, "username");
    const password = requiredString(req.body?.password, "password");

    const user = await pool.query(
      `
        SELECT id, username, password_hash, role, display_name
        FROM app_users
        WHERE lower(username) = lower($1)
      `,
      [username]
    );

    if (user.rowCount === 0 || !verifyPassword(password, user.rows[0].password_hash)) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password"
      });
    }

    const token = createToken();
    await pool.query("DELETE FROM auth_sessions WHERE expires_at <= now()");
    await pool.query(
      `
        INSERT INTO auth_sessions (token, user_id, expires_at)
        VALUES ($1, $2, now() + interval '7 days')
      `,
      [token, user.rows[0].id]
    );
    await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [user.rows[0].id]);

    res.json({
      success: true,
      token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        role: user.rows[0].role,
        display_name: user.rows[0].display_name
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  try {
    const token = req.get("authorization").slice(7).trim();
    await pool.query("DELETE FROM auth_sessions WHERE token = $1", [token]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

router.get("/api/users", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, username, role, display_name, created_at, last_login_at
      FROM app_users
      ORDER BY created_at ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/api/users", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin role is required" });
    }

    const username = requiredString(req.body?.username, "username");
    const password = requiredString(req.body?.password, "password");
    const role = req.body?.role === "admin" ? "admin" : "viewer";
    const displayName = req.body?.display_name ?? null;

    const result = await pool.query(
      `
        INSERT INTO app_users (username, password_hash, role, display_name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, role, display_name, created_at, last_login_at
      `,
      [username, hashPassword(password), role, displayName]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.get("/api/drivers", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        d.id,
        d.name_en,
        d.name_ar,
        d.phone_number,
        d.civil_id,
        d.is_active,
        d.created_at,
        d.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'card_no', c.card_no,
              'is_active', c.is_active,
              'created_at', c.created_at,
              'updated_at', c.updated_at
            )
            ORDER BY c.card_no
          ) FILTER (WHERE c.card_no IS NOT NULL),
          '[]'::json
        ) AS cards
      FROM drivers d
      LEFT JOIN driver_cards c ON c.driver_id = d.id AND c.deleted_at IS NULL
      WHERE d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY d.name_en ASC, d.civil_id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/api/drivers", requireAuth, async (req, res, next) => {
  try {
    const nameEn = requiredString(req.body?.name_en, "name_en");
    const civilId = requiredString(req.body?.civil_id, "civil_id");
    const id = idFromValue("D", civilId);
    const result = await pool.query(
      `
        INSERT INTO drivers (id, name_en, name_ar, phone_number, civil_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name_en, name_ar, phone_number, civil_id, is_active, created_at, updated_at
      `,
      [id, nameEn, req.body?.name_ar || null, req.body?.phone_number || null, civilId, req.body?.is_active !== false]
    );

    res.status(201).json({ success: true, data: { ...result.rows[0], cards: [] } });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/drivers/:id", requireAuth, async (req, res, next) => {
  try {
    const nameEn = requiredString(req.body?.name_en, "name_en");
    const civilId = requiredString(req.body?.civil_id, "civil_id");
    const existing = await pool.query(
      "SELECT is_active FROM drivers WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!existing.rowCount) return res.status(404).json({ success: false, error: "DRIVER_NOT_FOUND" });
    const isActive = typeof req.body?.is_active === "boolean" ? req.body.is_active : existing.rows[0].is_active;
    if (existing.rows[0].is_active !== isActive) requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE drivers
        SET name_en = $2,
            name_ar = $3,
            phone_number = $4,
            civil_id = $5,
            is_active = $6,
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name_en, name_ar, phone_number, civil_id, is_active, created_at, updated_at
      `,
      [req.params.id, nameEn, req.body?.name_ar || null, req.body?.phone_number || null, civilId, isActive]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/drivers/:id/status", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    if (typeof req.body?.is_active !== "boolean") {
      const err = new Error("is_active must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    const result = await pool.query(
      `
        UPDATE drivers
        SET is_active = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name_en, name_ar, phone_number, civil_id, is_active, created_at, updated_at
      `,
      [req.params.id, req.body.is_active]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "DRIVER_NOT_FOUND" });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/api/drivers/:id", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE drivers
        SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "DRIVER_NOT_FOUND" });
    await pool.query(
      "UPDATE driver_cards SET is_active = false, deleted_at = now(), updated_at = now() WHERE driver_id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/api/drivers/:id/cards", requireAuth, async (req, res, next) => {
  try {
    const cardNo = requiredString(req.body?.card_no, "card_no");
    const driver = await pool.query("SELECT id FROM drivers WHERE id = $1 AND deleted_at IS NULL", [req.params.id]);
    if (!driver.rowCount) return res.status(404).json({ success: false, error: "DRIVER_NOT_FOUND" });
    const result = await pool.query(
      `
        INSERT INTO driver_cards (card_no, driver_id, is_active)
        VALUES ($1, $2, $3)
        ON CONFLICT (card_no) DO UPDATE SET
          driver_id = EXCLUDED.driver_id,
          is_active = EXCLUDED.is_active,
          deleted_at = NULL,
          updated_at = now()
        RETURNING card_no, driver_id, is_active, created_at, updated_at
      `,
      [cardNo, req.params.id, req.body?.is_active !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/driver-cards/:cardNo/status", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    if (typeof req.body?.is_active !== "boolean") {
      const err = new Error("is_active must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    const result = await pool.query(
      `
        UPDATE driver_cards
        SET is_active = $2, updated_at = now()
        WHERE card_no = $1 AND deleted_at IS NULL
        RETURNING card_no, driver_id, is_active, created_at, updated_at
      `,
      [req.params.cardNo, req.body.is_active]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "CARD_NOT_FOUND" });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/api/driver-cards/:cardNo", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE driver_cards
        SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE card_no = $1 AND deleted_at IS NULL
        RETURNING card_no
      `,
      [req.params.cardNo]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "CARD_NOT_FOUND" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/api/stations", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, name_en, name_ar, longitude, latitude, is_active, created_at, updated_at
      FROM stations
      WHERE deleted_at IS NULL
      ORDER BY name_en ASC, id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/api/stations", requireAuth, async (req, res, next) => {
  try {
    const nameEn = requiredString(req.body?.name_en, "name_en");
    const id = idFromValue("S", req.body?.station_code || nameEn);
    const result = await pool.query(
      `
        INSERT INTO stations (id, name_en, name_ar, longitude, latitude, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name_en, name_ar, longitude, latitude, is_active, created_at, updated_at
      `,
      [id, nameEn, req.body?.name_ar || null, parseNumeric(req.body?.longitude), parseNumeric(req.body?.latitude), req.body?.is_active !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/stations/:id", requireAuth, async (req, res, next) => {
  try {
    const nameEn = requiredString(req.body?.name_en, "name_en");
    const existing = await pool.query(
      "SELECT is_active FROM stations WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id]
    );
    if (!existing.rowCount) return res.status(404).json({ success: false, error: "STATION_NOT_FOUND" });
    const isActive = typeof req.body?.is_active === "boolean" ? req.body.is_active : existing.rows[0].is_active;
    if (existing.rows[0].is_active !== isActive) requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE stations
        SET name_en = $2,
            name_ar = $3,
            longitude = $4,
            latitude = $5,
            is_active = $6,
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name_en, name_ar, longitude, latitude, is_active, created_at, updated_at
      `,
      [req.params.id, nameEn, req.body?.name_ar || null, parseNumeric(req.body?.longitude), parseNumeric(req.body?.latitude), isActive]
    );
    await pool.query(
      `
        UPDATE buses
        SET route_config_version = route_config_version + 1, updated_at = now()
        WHERE deleted_at IS NULL
          AND active_route_id IN (
            SELECT id FROM routes
            WHERE deleted_at IS NULL
              AND (start_station_id = $1 OR end_station_id = $1)
          )
      `,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/stations/:id/status", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    if (typeof req.body?.is_active !== "boolean") {
      const err = new Error("is_active must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    const result = await pool.query(
      `
        UPDATE stations
        SET is_active = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name_en, name_ar, longitude, latitude, is_active, created_at, updated_at
      `,
      [req.params.id, req.body.is_active]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "STATION_NOT_FOUND" });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/api/stations/:id", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE stations
        SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "STATION_NOT_FOUND" });
    await pool.query(
      `
        WITH cleared_routes AS (
          UPDATE routes
          SET start_station_id = NULLIF(start_station_id, $1),
              end_station_id = NULLIF(end_station_id, $1),
              updated_at = now()
          WHERE deleted_at IS NULL
            AND (start_station_id = $1 OR end_station_id = $1)
          RETURNING id
        )
        UPDATE buses
        SET route_config_version = route_config_version + 1, updated_at = now()
        WHERE deleted_at IS NULL
          AND active_route_id IN (SELECT id FROM cleared_routes)
      `,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/api/card-types", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        d.card_type,
        d.is_driver_card,
        COUNT(t.id)::bigint AS transaction_count,
        COUNT(t.id) FILTER (WHERE t.record_type IN ('43', '44'))::bigint AS driver_event_count,
        COALESCE(
          SUM(t.amount_display_kwd) FILTER (WHERE NOT d.is_driver_card),
          0
        )::numeric(14,3) AS revenue_kwd,
        d.created_at,
        d.updated_at
      FROM card_type_definitions d
      LEFT JOIN transactions t ON t.card_type = d.card_type
      GROUP BY d.card_type, d.is_driver_card, d.created_at, d.updated_at
      ORDER BY d.card_type ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.put("/api/card-types/:cardType", requireAuth, async (req, res, next) => {
  try {
    const cardType = requiredString(req.params.cardType, "card_type");
    if (typeof req.body?.is_driver_card !== "boolean") {
      const err = new Error("is_driver_card must be a boolean");
      err.statusCode = 400;
      throw err;
    }

    const result = await pool.query(
      `
        INSERT INTO card_type_definitions (card_type, is_driver_card)
        VALUES ($1, $2)
        ON CONFLICT (card_type) DO UPDATE SET
          is_driver_card = EXCLUDED.is_driver_card,
          updated_at = now()
        RETURNING card_type, is_driver_card, created_at, updated_at
      `,
      [cardType, req.body.is_driver_card]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/api/transactions/bulk", requireApiKey, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const body = req.body || {};
    const deviceId = requiredString(body.device_id, "device_id");
    const routeExtra = body.route_extra === undefined ? null : JSON.stringify(body.route_extra);
    const transactions = Array.isArray(body.transactions) ? body.transactions : [];
    const rawBatchLocation = body.location && typeof body.location === "object" ? body.location : {};
    const batchLocation = normalizeLocation({
      ...rawBatchLocation,
      location_time: rawBatchLocation.location_time ?? body.location_time,
      source: rawBatchLocation.source ?? body.location_source,
      accuracy: rawBatchLocation.accuracy ?? body.location_accuracy,
      speed: rawBatchLocation.speed ?? body.speed,
      bearing: rawBatchLocation.bearing ?? body.bearing
    });

    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO devices (device_id, bus_no, route_no, route_name, route_extra, last_seen_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now()
          , bus_no = COALESCE(EXCLUDED.bus_no, devices.bus_no)
          , route_no = COALESCE(EXCLUDED.route_no, devices.route_no)
          , route_name = COALESCE(EXCLUDED.route_name, devices.route_name)
          , route_extra = COALESCE(EXCLUDED.route_extra, devices.route_extra)
      `,
      [
        deviceId,
        body.bus_no ?? null,
        body.route_no ?? null,
        body.route_name ?? null,
        routeExtra
      ]
    );

    let accepted = 0;

    for (const tx of transactions) {
      const recordUid = requiredString(tx.record_uid, "transactions[].record_uid");
      const cardType = tx.card_type == null ? null : String(tx.card_type).trim() || null;
      const txTime = parseDateTime(tx.transaction_datetime);
      const scanLocation = transactionLocation(batchLocation, tx);
      if (cardType) {
        await client.query(
          `
            INSERT INTO card_type_definitions (card_type)
            VALUES ($1)
            ON CONFLICT (card_type) DO NOTHING
          `,
          [cardType]
        );
      }
      const result = await client.query(
        `
          INSERT INTO transactions (
            record_uid, device_id, record_index, sequence_no, card_no, card_type,
            card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
            amount_display_kwd, amount_copy_raw, transaction_datetime,
            transaction_datetime_raw, record_type, sub_type, crc, source_file,
            scan_lat, scan_lng, scan_location_source, scan_location_accuracy, scan_location_time, payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25
          )
          ON CONFLICT (record_uid) DO NOTHING
          RETURNING true AS inserted
        `,
        [
          recordUid,
          deviceId,
          parseNumeric(tx.record_index),
          tx.sequence_no ?? null,
          tx.card_no ?? null,
          cardType,
          tx.card_expiry ?? null,
          tx.counter ?? null,
          parseNumeric(tx.balance_raw),
          parseNumeric(tx.balance_display_kwd),
          parseNumeric(tx.amount_raw),
          parseNumeric(tx.amount_display_kwd),
          parseNumeric(tx.amount_copy_raw),
          txTime,
          tx.transaction_datetime_raw ?? null,
          tx.record_type ?? null,
          tx.sub_type ?? null,
          tx.crc ?? null,
          body.source_file ?? null,
          scanLocation.lat,
          scanLocation.lng,
          scanLocation.source,
          scanLocation.accuracy,
          scanLocation.locationTime,
          tx
        ]
      );
      const inserted = result.rows.some((row) => row.inserted);
      accepted += inserted ? 1 : 0;

      if (inserted && scanLocation.lat !== null && scanLocation.lng !== null) {
        await client.query(
          `
            INSERT INTO bus_locations (
              device_id, bus_no, lat, lng, speed, bearing, source, location_time
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            deviceId,
            body.bus_no ?? null,
            scanLocation.lat,
            scanLocation.lng,
            scanLocation.speed,
            scanLocation.bearing,
            scanLocation.source ?? "transaction_scan",
            scanLocation.locationTime ?? txTime
          ]
        );
      }
    }

    const received = transactions.length;
    const duplicates = received - accepted;

    await client.query(
      `
        INSERT INTO sync_batches (
          device_id, source_file, record_count, last_uploaded_count, new_count,
          accepted, duplicates, received, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        deviceId,
        body.source_file ?? null,
        parseNumeric(body.record_count),
        parseNumeric(body.last_uploaded_count),
        parseNumeric(body.new_count),
        accepted,
        duplicates,
        received,
        body
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      accepted,
      duplicates,
      received
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.post("/api/buses/location", requireApiKey, async (req, res, next) => {
  try {
    const body = req.body || {};
    const deviceId = requiredString(body.device_id, "device_id");
    const location = normalizeLocation(body);

    await pool.query(
      `
        INSERT INTO devices (device_id, bus_no, route_no, last_seen_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (device_id) DO UPDATE SET
          bus_no = COALESCE(EXCLUDED.bus_no, devices.bus_no),
          route_no = COALESCE(EXCLUDED.route_no, devices.route_no),
          last_seen_at = now()
      `,
      [deviceId, body.bus_no ?? null, body.route_no ?? null]
    );

    if (location.lat === null || location.lng === null) {
      return res.status(202).json({ success: true, location_saved: false });
    }

    const result = await pool.query(
      `
        INSERT INTO bus_locations (
          device_id, bus_no, lat, lng, speed, bearing, source, location_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        deviceId,
        body.bus_no ?? null,
        location.lat,
        location.lng,
        location.speed,
        location.bearing,
        location.source,
        location.locationTime
      ]
    );

    res.status(201).json({ success: true, location_saved: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.get("/api/routes", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.route_code, r.route_name, r.fare_fils, r.is_active,
             r.start_station_id, r.end_station_id,
             ss.name_en AS start_station_name_en, ss.name_ar AS start_station_name_ar,
             ss.longitude AS start_station_longitude, ss.latitude AS start_station_latitude,
             es.name_en AS end_station_name_en, es.name_ar AS end_station_name_ar,
             es.longitude AS end_station_longitude, es.latitude AS end_station_latitude,
             r.created_at, r.updated_at, COUNT(b.id)::int AS assigned_buses_count
      FROM routes r
      LEFT JOIN stations ss ON ss.id = r.start_station_id
      LEFT JOIN stations es ON es.id = r.end_station_id
      LEFT JOIN buses b ON b.active_route_id = r.id AND b.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      GROUP BY r.id, ss.name_en, ss.name_ar, ss.longitude, ss.latitude,
               es.name_en, es.name_ar, es.longitude, es.latitude
      ORDER BY route_code ASC
    `);

    res.json({ success: true, data: result.rows.map(routeResponse) });
  } catch (err) {
    next(err);
  }
});

router.post("/api/routes", requireAuth, async (req, res, next) => {
  try {
    const routeCode = requiredString(req.body?.route_code, "route_code");
    const routeName = requiredString(req.body?.route_name, "route_name");
    const fareFils = parseNonNegativeInteger(req.body?.fare_fils, "fare_fils");
    const startStationId = req.body?.start_station_id || null;
    const endStationId = req.body?.end_station_id || null;
    const id = routeIdFromCode(routeCode);

    if (startStationId || endStationId) {
      const stations = await pool.query(
        "SELECT id FROM stations WHERE id = ANY($1::text[]) AND deleted_at IS NULL",
        [[startStationId, endStationId].filter(Boolean)]
      );
      if (stations.rowCount !== [startStationId, endStationId].filter(Boolean).length) {
        return res.status(404).json({ success: false, error: "STATION_NOT_FOUND" });
      }
    }

    const result = await pool.query(
      `
        INSERT INTO routes (id, route_code, route_name, fare_fils, start_station_id, end_station_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, route_code, route_name, fare_fils, start_station_id, end_station_id, is_active, created_at, updated_at
      `,
      [id, routeCode, routeName, fareFils, startStationId, endStationId, req.body?.is_active !== false]
    );

    res.status(201).json({ success: true, data: routeResponse({ ...result.rows[0], assigned_buses_count: 0 }) });
  } catch (err) {
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  }
});

router.put("/api/routes/:id", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const routeCode = requiredString(req.body?.route_code, "route_code");
    const routeName = requiredString(req.body?.route_name, "route_name");
    const fareFils = parseNonNegativeInteger(req.body?.fare_fils, "fare_fils");
    const isActive = req.body?.is_active !== false;
    const startStationId = req.body?.start_station_id || null;
    const endStationId = req.body?.end_station_id || null;

    await client.query("BEGIN");
    const existing = await client.query("SELECT * FROM routes WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "ROUTE_NOT_FOUND" });
    }
    if (existing.rows[0].deleted_at) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "ROUTE_NOT_FOUND" });
    }
    if (existing.rows[0].is_active !== isActive) {
      requireAdminUser(req);
    }

    if (startStationId || endStationId) {
      const stations = await client.query(
        "SELECT id FROM stations WHERE id = ANY($1::text[]) AND deleted_at IS NULL",
        [[startStationId, endStationId].filter(Boolean)]
      );
      if (stations.rowCount !== [startStationId, endStationId].filter(Boolean).length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, error: "STATION_NOT_FOUND" });
      }
    }

    const result = await client.query(
      `
        UPDATE routes
        SET route_code = $2,
            route_name = $3,
            fare_fils = $4,
            is_active = $5,
            start_station_id = $6,
            end_station_id = $7,
            updated_at = now()
        WHERE id = $1
        RETURNING id, route_code, route_name, fare_fils, start_station_id, end_station_id, is_active, created_at, updated_at
      `,
      [req.params.id, routeCode, routeName, fareFils, isActive, startStationId, endStationId]
    );

    const assignedDeviceConfigChanged =
      existing.rows[0].route_code !== routeCode ||
      existing.rows[0].route_name !== routeName ||
      Number(existing.rows[0].fare_fils) !== fareFils ||
      existing.rows[0].is_active !== isActive ||
      (existing.rows[0].start_station_id || null) !== startStationId ||
      (existing.rows[0].end_station_id || null) !== endStationId;

    if (assignedDeviceConfigChanged) {
      await client.query(
        `INSERT INTO route_change_logs
          (bus_id, old_route_id, new_route_id, old_fare_fils, new_fare_fils,
           old_device_id, new_device_id, old_bus_number, new_bus_number, changed_by)
         SELECT b.id, b.active_route_id, b.active_route_id, $2, $3,
                b.device_id, b.device_id, b.bus_code, b.bus_code, $4
         FROM buses b WHERE b.active_route_id = $1`,
        [req.params.id, existing.rows[0].fare_fils, fareFils, req.user?.username || null]
      );
      await client.query(
        `UPDATE buses
         SET route_config_version = route_config_version + 1, updated_at = now()
         WHERE active_route_id = $1`,
        [req.params.id]
      );
    }

    const count = await client.query("SELECT COUNT(*)::int AS count FROM buses WHERE active_route_id = $1", [req.params.id]);
    await client.query("COMMIT");

    res.json({ success: true, data: routeResponse({ ...result.rows[0], assigned_buses_count: count.rows[0].count }) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  } finally {
    client.release();
  }
});

router.delete("/api/routes/:id", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE routes
        SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "ROUTE_NOT_FOUND" });
    await pool.query(
      `UPDATE buses
       SET route_config_version = route_config_version + 1, updated_at = now()
       WHERE active_route_id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/api/buses", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id,
        b.bus_code,
        b.bus_code AS bus_number,
        b.plate_number,
        b.device_id,
        b.active_route_id,
        b.route_config_version,
        b.is_active,
        b.created_at,
        b.updated_at,
        d.last_seen_at,
        r.route_code,
        r.route_code AS active_route_code,
        r.route_name,
        r.route_name AS active_route_name,
        r.fare_fils,
        r.is_active AS route_is_active
      FROM buses b
      LEFT JOIN devices d ON d.device_id = b.device_id
      LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
      WHERE b.deleted_at IS NULL
      ORDER BY b.bus_code ASC
    `);

    res.json({ success: true, data: result.rows.map(busResponse) });
  } catch (err) {
    next(err);
  }
});

router.post("/api/buses", requireAuth, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const busCode = requiredString(req.body?.bus_number ?? req.body?.bus_code, "bus_number");
    const deviceId = requiredString(req.body?.device_id, "device_id");
    const plateNumber = req.body?.plate_number || null;
    const activeRouteId = req.body?.active_route_id || null;

    await client.query("BEGIN");
    if (activeRouteId) {
      const route = await client.query("SELECT is_active FROM routes WHERE id = $1 AND deleted_at IS NULL", [activeRouteId]);
      if (route.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, error: "ROUTE_NOT_FOUND" });
      }
      if (!route.rows[0].is_active) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, error: "ROUTE_INACTIVE" });
      }
    }
    await client.query(
      `
        INSERT INTO devices (device_id, bus_no)
        VALUES ($1, $2)
        ON CONFLICT (device_id) DO UPDATE SET bus_no = COALESCE(devices.bus_no, EXCLUDED.bus_no)
      `,
      [deviceId, busCode]
    );

    const result = await client.query(
      `
        INSERT INTO buses (id, bus_code, plate_number, device_id, active_route_id)
        VALUES ($1, $1, $2, $3, $4)
        RETURNING id, bus_code, plate_number, device_id, active_route_id, route_config_version, is_active, created_at, updated_at
      `,
      [busCode, plateNumber, deviceId, activeRouteId]
    );

    await client.query("COMMIT");
    const configured = await pool.query(
      `SELECT b.*, b.bus_code AS bus_number, d.last_seen_at, r.route_code, r.route_name, r.fare_fils,
              r.is_active AS route_is_active
       FROM buses b
       LEFT JOIN devices d ON d.device_id = b.device_id
       LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
       WHERE b.id = $1 AND b.deleted_at IS NULL`,
      [result.rows[0].id]
    );
    res.status(201).json({ success: true, data: busResponse(configured.rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23503") err.statusCode = 400;
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  } finally {
    client.release();
  }
});

router.put("/api/buses/:id", requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT b.*, r.fare_fils AS effective_fare_fils
       FROM buses b LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
       WHERE b.id = $1 AND b.deleted_at IS NULL FOR UPDATE OF b`, [req.params.id]
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "BUS_NOT_FOUND" });
    }

    const current = existing.rows[0];
    const deviceId = requiredString(req.body?.device_id ?? current.device_id, "device_id");
    const busNumber = requiredString(req.body?.bus_number ?? req.body?.bus_code ?? current.bus_code, "bus_number");
    const changed = deviceId !== current.device_id || busNumber !== current.bus_code;

    if (deviceId !== current.device_id) {
      await client.query(
        `INSERT INTO devices (device_id, bus_no)
         SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM devices WHERE device_id = $1)`,
        [deviceId, busNumber]
      );
      const owner = await client.query("SELECT id FROM buses WHERE device_id = $1 AND id <> $2", [deviceId, current.id]);
      if (owner.rowCount) {
        const err = new Error("device_id already exists"); err.statusCode = 409; throw err;
      }
    }

    const updated = await client.query(
      `UPDATE buses SET bus_code = $2, device_id = $3,
         route_config_version = route_config_version + CASE WHEN $4 THEN 1 ELSE 0 END,
         updated_at = CASE WHEN $4 THEN now() ELSE updated_at END
       WHERE id = $1 RETURNING *`,
      [current.id, busNumber, deviceId, changed]
    );
    await client.query("UPDATE devices SET bus_no = $2 WHERE device_id = $1", [deviceId, busNumber]);

    if (changed) {
      await client.query(
        `INSERT INTO route_change_logs
          (bus_id, old_route_id, new_route_id, old_fare_fils, new_fare_fils, old_device_id, new_device_id,
           old_bus_number, new_bus_number, changed_by)
         VALUES ($1,$2,$2,$3,$3,$4,$5,$6,$7,$8)`,
        [current.id, current.active_route_id, current.effective_fare_fils, current.device_id, deviceId,
          current.bus_code, busNumber, req.user?.username || null]
      );
    }
    await client.query("COMMIT");
    const result = await pool.query(
      `SELECT b.*, b.bus_code AS bus_number, d.last_seen_at, r.route_code, r.route_name, r.fare_fils,
              r.is_active AS route_is_active
       FROM buses b
       LEFT JOIN devices d ON d.device_id = b.device_id
       LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
       WHERE b.id = $1 AND b.deleted_at IS NULL`,
      [current.id]
    );
    res.json({ success: true, data: busResponse(result.rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") err.statusCode = 409;
    next(err);
  } finally { client.release(); }
});

router.put("/api/buses/:id/status", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    if (typeof req.body?.is_active !== "boolean") {
      const err = new Error("is_active must be a boolean");
      err.statusCode = 400;
      throw err;
    }
    const result = await pool.query(
      `
        UPDATE buses
        SET is_active = $2,
            route_config_version = route_config_version + 1,
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, bus_code, plate_number, device_id, active_route_id, route_config_version, is_active, created_at, updated_at
      `,
      [req.params.id, req.body.is_active]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "BUS_NOT_FOUND" });
    res.json({ success: true, data: busResponse(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete("/api/buses/:id", requireAuth, async (req, res, next) => {
  try {
    requireAdminUser(req);
    const result = await pool.query(
      `
        UPDATE buses
        SET is_active = false,
            deleted_at = now(),
            route_config_version = route_config_version + 1,
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "BUS_NOT_FOUND" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put("/api/buses/:id/active-route", requireAuth, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const newRouteId = requiredString(req.body?.active_route_id, "active_route_id");

    await client.query("BEGIN");

    const bus = await client.query(
      `
        SELECT b.id, b.active_route_id, b.route_config_version, old_route.fare_fils AS old_fare_fils
        FROM buses b
        LEFT JOIN routes old_route ON old_route.id = b.active_route_id
        WHERE b.id = $1
          AND b.deleted_at IS NULL
        FOR UPDATE OF b
      `,
      [req.params.id]
    );

    if (bus.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "BUS_NOT_FOUND" });
    }

    const nextRoute = await client.query(
      "SELECT id, fare_fils, is_active FROM routes WHERE id = $1 AND deleted_at IS NULL",
      [newRouteId]
    );

    if (nextRoute.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "ROUTE_NOT_FOUND" });
    }
    if (!nextRoute.rows[0].is_active) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, error: "ROUTE_INACTIVE" });
    }

    const current = bus.rows[0];
    if (current.active_route_id === newRouteId) {
      const unchanged = await client.query(
        `
          SELECT
            b.id, b.bus_code, b.plate_number, b.device_id, b.active_route_id,
            b.route_config_version, b.is_active, b.created_at, b.updated_at,
            r.route_code, r.route_name, r.fare_fils, r.is_active AS route_is_active
          FROM buses b
          LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
          WHERE b.id = $1 AND b.deleted_at IS NULL
        `,
        [req.params.id]
      );
      await client.query("COMMIT");
      return res.json({ success: true, data: busResponse(unchanged.rows[0]) });
    }

    const updated = await client.query(
      `
        UPDATE buses
        SET active_route_id = $2,
            route_config_version = route_config_version + 1,
            updated_at = now()
        WHERE id = $1
        RETURNING id, bus_code, plate_number, device_id, active_route_id, route_config_version, is_active, created_at, updated_at
      `,
      [req.params.id, newRouteId]
    );

    await client.query(
      `
        INSERT INTO route_change_logs (
          bus_id, old_route_id, new_route_id, old_fare_fils, new_fare_fils, changed_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        req.params.id,
        current.active_route_id,
        newRouteId,
        current.old_fare_fils,
        nextRoute.rows[0].fare_fils,
        req.user?.username || null
      ]
    );

    await client.query("COMMIT");

    const route = await pool.query(
      `
        SELECT
          b.id, b.bus_code, b.plate_number, b.device_id, b.active_route_id,
          b.route_config_version, b.is_active, b.created_at, b.updated_at,
          r.route_code, r.route_name, r.fare_fils, r.is_active AS route_is_active
        FROM buses b
        LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
        WHERE b.id = $1 AND b.deleted_at IS NULL
      `,
      [updated.rows[0].id]
    );

    res.json({ success: true, data: busResponse(route.rows[0]) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

router.get("/api/devices/:deviceId/active-route", requireApiKey, async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          b.id AS bus_id,
          b.bus_code AS bus_number,
          b.device_id,
          b.active_route_id,
          b.route_config_version,
          b.updated_at,
          r.id AS route_id,
          r.route_code,
          r.route_name,
          r.fare_fils,
          r.is_active AS route_is_active,
          r.start_station_id,
          r.end_station_id,
          ss.name_en AS start_station_name_en,
          ss.name_ar AS start_station_name_ar,
          es.name_en AS end_station_name_en,
          es.name_ar AS end_station_name_ar
        FROM buses b
        LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
        LEFT JOIN stations ss ON ss.id = r.start_station_id
        LEFT JOIN stations es ON es.id = r.end_station_id
        WHERE b.device_id = $1
          AND b.is_active = true
          AND b.deleted_at IS NULL
          AND (r.deleted_at IS NULL OR r.id IS NULL)
      `,
      [req.params.deviceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: "DEVICE_NOT_FOUND" });
    }

    const row = result.rows[0];
    if (!row.active_route_id || !row.route_id) {
      return res.status(404).json({ success: false, error: "NO_ACTIVE_ROUTE" });
    }
    if (!row.route_is_active) {
      return res.status(409).json({ success: false, error: "ROUTE_INACTIVE" });
    }

    res.json({
      success: true,
      device_id: row.device_id,
      bus_id: row.bus_id,
      bus_number: row.bus_number,
      version: row.route_config_version,
      route_id: row.route_id,
      route_code: row.route_code,
      route_name: row.route_name,
      fare_fils: row.fare_fils,
      fare_kwd: formatFareKwd(row.fare_fils),
      start_station_id: row.start_station_id,
      start_station_name_en: row.start_station_name_en,
      start_station_name_ar: row.start_station_name_ar,
      end_station_id: row.end_station_id,
      end_station_name_en: row.end_station_name_en,
      end_station_name_ar: row.end_station_name_ar,
      updated_at: row.updated_at
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/summary", async (req, res, next) => {
  try {
    const result = await pool.query(`
      WITH normalized AS (
        SELECT
          t.amount_display_kwd,
          t.transaction_datetime,
          ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
        FROM transactions t
        LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
        WHERE NOT COALESCE(c.is_driver_card, false)
      )
      SELECT
        COUNT(*)::bigint AS total_transactions,
        COALESCE(SUM(amount_display_kwd), 0)::numeric(14,3) AS total_revenue_kwd,
        COUNT(*) FILTER (
          WHERE transaction_datetime_kuwait_ts::date = (now() AT TIME ZONE 'Asia/Kuwait')::date
        )::bigint AS today_transactions,
        COALESCE(SUM(amount_display_kwd) FILTER (
          WHERE transaction_datetime_kuwait_ts::date = (now() AT TIME ZONE 'Asia/Kuwait')::date
        ), 0)::numeric(14,3) AS today_revenue_kwd,
        (SELECT COUNT(*)::bigint FROM devices WHERE last_seen_at >= now() - interval '24 hours') AS active_devices,
        MAX(transaction_datetime) AS last_transaction_at,
        to_char(MAX(transaction_datetime_kuwait_ts), 'YYYY-MM-DD HH24:MI:SS') AS last_transaction_kuwait
      FROM normalized
    `);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/daily", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const result = await pool.query(
      `
        WITH normalized AS (
          SELECT
            t.amount_display_kwd,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions t
          LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
          WHERE NOT COALESCE(c.is_driver_card, false)
        )
        SELECT
          to_char(transaction_datetime_kuwait_ts::date, 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS transaction_count,
          COALESCE(SUM(amount_display_kwd), 0)::numeric(14,3) AS revenue_kwd
        FROM normalized
        WHERE transaction_datetime_kuwait_ts IS NOT NULL
          AND ($1::date IS NULL OR transaction_datetime_kuwait_ts::date >= $1::date)
          AND ($2::date IS NULL OR transaction_datetime_kuwait_ts::date <= $2::date)
        GROUP BY transaction_datetime_kuwait_ts::date
        ORDER BY date DESC
      `,
      [from || null, to || null]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/devices", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        d.device_id,
        d.bus_no,
        d.route_no,
        d.route_name,
        d.route_extra,
        d.last_seen_at,
        COUNT(t.id) FILTER (WHERE NOT COALESCE(c.is_driver_card, false))::bigint AS total_transactions,
        COALESCE(
          SUM(t.amount_display_kwd) FILTER (WHERE NOT COALESCE(c.is_driver_card, false)),
          0
        )::numeric(14,3) AS total_revenue_kwd,
        MAX(t.transaction_datetime) FILTER (WHERE NOT COALESCE(c.is_driver_card, false)) AS last_transaction_at
      FROM devices d
      LEFT JOIN transactions t ON t.device_id = d.device_id
      LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
      GROUP BY d.device_id
      ORDER BY d.last_seen_at DESC NULLS LAST, d.device_id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/transactions", async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 100);
    const offset = parsePositiveInt(req.query.offset, 0, 1000000);
    const {
      device_id: deviceId,
      card_no: cardNo,
      from,
      to,
      bus_number: busNumber
    } = req.query;
    const routeFilter = req.query.route ?? req.query.route_no ?? req.query.route_name;
    const driverFilter = req.query.driver ?? req.query.driver_card_no;

    const rows = await pool.query(
      `
        WITH normalized AS (
          SELECT
            t.id, t.record_uid, t.device_id, t.record_index, t.sequence_no, t.card_no, t.card_type,
            t.card_expiry, t.counter, t.balance_raw, t.balance_display_kwd, t.amount_raw,
            t.amount_display_kwd, t.amount_copy_raw, t.transaction_datetime,
            t.transaction_datetime_raw, t.record_type, t.sub_type, t.crc, t.source_file, t.received_at,
            t.scan_lat, t.scan_lng, t.scan_location_source, t.scan_location_accuracy, t.scan_location_time,
            COALESCE(b.bus_code, d.bus_no) AS bus_number,
            b.active_route_id AS current_route_id,
            COALESCE(r.route_code, d.route_no) AS current_route_code,
            COALESCE(r.route_name, d.route_name) AS current_route_name,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.card_no ELSE NULL END AS current_driver_card_no,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_id ELSE NULL END AS current_driver_id,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_name_en ELSE NULL END AS current_driver_name_en,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_name_ar ELSE NULL END AS current_driver_name_ar,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_civil_id ELSE NULL END AS current_driver_civil_id,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_phone_number ELSE NULL END AS current_driver_phone_number,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions t
          LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
          LEFT JOIN devices d ON d.device_id = t.device_id
          LEFT JOIN buses b ON b.device_id = t.device_id
          LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
          LEFT JOIN LATERAL (
            SELECT
              dt.card_no,
              dt.record_type,
              driver_cards.driver_id,
              drivers.name_en AS driver_name_en,
              drivers.name_ar AS driver_name_ar,
              drivers.civil_id AS driver_civil_id,
              drivers.phone_number AS driver_phone_number
            FROM transactions dt
            INNER JOIN card_type_definitions dc
              ON dc.card_type = dt.card_type AND dc.is_driver_card = true
            LEFT JOIN driver_cards
              ON driver_cards.card_no = dt.card_no AND driver_cards.deleted_at IS NULL
            LEFT JOIN drivers
              ON drivers.id = driver_cards.driver_id AND drivers.deleted_at IS NULL
            WHERE dt.device_id = t.device_id
              AND dt.record_type IN ('43', '44')
              AND (
                (
                  t.transaction_datetime IS NOT NULL
                  AND dt.transaction_datetime IS NOT NULL
                  AND dt.transaction_datetime <= t.transaction_datetime
                )
                OR (
                  (t.transaction_datetime IS NULL OR dt.transaction_datetime IS NULL)
                  AND dt.id <= t.id
                )
              )
            ORDER BY COALESCE(dt.transaction_datetime, dt.received_at) DESC, dt.id DESC
            LIMIT 1
          ) driver_event ON true
          WHERE NOT COALESCE(c.is_driver_card, false)
        )
        SELECT
          id, record_uid, device_id, record_index, sequence_no, card_no, card_type,
          card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
          amount_display_kwd, amount_copy_raw, transaction_datetime,
          bus_number, current_route_id, current_route_code, current_route_name,
          current_driver_card_no, current_driver_id, current_driver_name_en, current_driver_name_ar,
          current_driver_civil_id, current_driver_phone_number,
          scan_lat, scan_lng, scan_location_source, scan_location_accuracy, scan_location_time,
          transaction_datetime_raw,
          to_char(transaction_datetime_kuwait_ts, 'YYYY-MM-DD HH24:MI:SS') AS transaction_datetime_kuwait,
          record_type, sub_type, crc, source_file, received_at
        FROM normalized
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime_kuwait_ts::date >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime_kuwait_ts::date <= $4::date)
          AND ($5::text IS NULL OR bus_number = $5)
          AND (
            $6::text IS NULL
            OR current_route_id = $6
            OR current_route_code = $6
            OR current_route_name = $6
          )
          AND (
            $7::text IS NULL
            OR current_driver_card_no = $7
            OR current_driver_id = $7
            OR current_driver_name_en = $7
            OR current_driver_name_ar = $7
            OR current_driver_civil_id = $7
          )
        ORDER BY id DESC
        LIMIT $8 OFFSET $9
      `,
      [deviceId || null, cardNo || null, from || null, to || null, busNumber || null, routeFilter || null, driverFilter || null, limit, offset]
    );

    const count = await pool.query(
      `
        WITH normalized AS (
          SELECT
            t.device_id,
            t.card_no,
            t.amount_raw,
            COALESCE(b.bus_code, d.bus_no) AS bus_number,
            b.active_route_id AS current_route_id,
            COALESCE(r.route_code, d.route_no) AS current_route_code,
            COALESCE(r.route_name, d.route_name) AS current_route_name,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.card_no ELSE NULL END AS current_driver_card_no,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_id ELSE NULL END AS current_driver_id,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_name_en ELSE NULL END AS current_driver_name_en,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_name_ar ELSE NULL END AS current_driver_name_ar,
            CASE WHEN driver_event.record_type = '43' THEN driver_event.driver_civil_id ELSE NULL END AS current_driver_civil_id,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions t
          LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
          LEFT JOIN devices d ON d.device_id = t.device_id
          LEFT JOIN buses b ON b.device_id = t.device_id
          LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
          LEFT JOIN LATERAL (
            SELECT
              dt.card_no,
              dt.record_type,
              driver_cards.driver_id,
              drivers.name_en AS driver_name_en,
              drivers.name_ar AS driver_name_ar,
              drivers.civil_id AS driver_civil_id
            FROM transactions dt
            INNER JOIN card_type_definitions dc
              ON dc.card_type = dt.card_type AND dc.is_driver_card = true
            LEFT JOIN driver_cards
              ON driver_cards.card_no = dt.card_no AND driver_cards.deleted_at IS NULL
            LEFT JOIN drivers
              ON drivers.id = driver_cards.driver_id AND drivers.deleted_at IS NULL
            WHERE dt.device_id = t.device_id
              AND dt.record_type IN ('43', '44')
              AND (
                (
                  t.transaction_datetime IS NOT NULL
                  AND dt.transaction_datetime IS NOT NULL
                  AND dt.transaction_datetime <= t.transaction_datetime
                )
                OR (
                  (t.transaction_datetime IS NULL OR dt.transaction_datetime IS NULL)
                  AND dt.id <= t.id
                )
              )
            ORDER BY COALESCE(dt.transaction_datetime, dt.received_at) DESC, dt.id DESC
            LIMIT 1
          ) driver_event ON true
          WHERE NOT COALESCE(c.is_driver_card, false)
        )
        SELECT
          COUNT(*)::bigint AS total,
          COALESCE(
            SUM(
              CASE
                WHEN amount_raw IS NULL THEN 0
                WHEN amount_raw = 25 THEN amount_raw::numeric / 100
                ELSE amount_raw::numeric / 1000
              END
            ),
            0
          )::numeric(14,3) AS amount_total_kwd
        FROM normalized
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime_kuwait_ts::date >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime_kuwait_ts::date <= $4::date)
          AND ($5::text IS NULL OR bus_number = $5)
          AND (
            $6::text IS NULL
            OR current_route_id = $6
            OR current_route_code = $6
            OR current_route_name = $6
          )
          AND (
            $7::text IS NULL
            OR current_driver_card_no = $7
            OR current_driver_id = $7
            OR current_driver_name_en = $7
            OR current_driver_name_ar = $7
            OR current_driver_civil_id = $7
          )
      `,
      [deviceId || null, cardNo || null, from || null, to || null, busNumber || null, routeFilter || null, driverFilter || null]
    );

    res.json({
      success: true,
      data: rows.rows.map((row) =>
        applyMoneyScale({
          ...row,
          transaction_datetime_kuwait:
            row.transaction_datetime_kuwait || parseRawWithOffset(row.transaction_datetime_raw, deviceTimeOffsetHours)
        })
      ),
      pagination: {
        limit,
        offset,
        total: Number(count.rows[0].total)
      },
      summary: {
        amount_total_kwd: Number(count.rows[0].amount_total_kwd || 0)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/card-types", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(t.card_type, 'unknown') AS card_type,
        COUNT(*)::bigint AS transaction_count,
        COALESCE(SUM(t.amount_display_kwd), 0)::numeric(14,3) AS revenue_kwd
      FROM transactions t
      LEFT JOIN card_type_definitions c ON c.card_type = t.card_type
      WHERE NOT COALESCE(c.is_driver_card, false)
      GROUP BY COALESCE(t.card_type, 'unknown')
      ORDER BY transaction_count DESC, card_type ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/driver-events", async (req, res, next) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 200, 1000);
    const result = await pool.query(
      `
        WITH normalized AS (
          SELECT
            t.id,
            t.record_uid,
            t.device_id,
            t.card_no,
            t.card_type,
            driver_cards.driver_id,
            drivers.name_en AS driver_name_en,
            drivers.name_ar AS driver_name_ar,
            drivers.civil_id AS driver_civil_id,
            drivers.phone_number AS driver_phone_number,
            t.record_type,
            t.sub_type,
            t.transaction_datetime,
            t.transaction_datetime_raw,
            t.scan_lat,
            t.scan_lng,
            t.scan_location_source,
            t.scan_location_accuracy,
            t.scan_location_time,
            t.received_at,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions t
          INNER JOIN card_type_definitions c
            ON c.card_type = t.card_type AND c.is_driver_card = true
          LEFT JOIN driver_cards
            ON driver_cards.card_no = t.card_no AND driver_cards.deleted_at IS NULL
          LEFT JOIN drivers
            ON drivers.id = driver_cards.driver_id AND drivers.deleted_at IS NULL
          WHERE t.record_type IN ('43', '44')
        )
        SELECT
          n.id,
          n.record_uid,
          n.device_id,
          COALESCE(b.bus_code, d.bus_no) AS bus_number,
          d.route_no,
          d.route_name,
          n.card_no,
          n.card_type,
          n.driver_id,
          n.driver_name_en,
          n.driver_name_ar,
          n.driver_civil_id,
          n.driver_phone_number,
          CASE n.record_type
            WHEN '43' THEN 'login'
            WHEN '44' THEN 'logout'
          END AS event_type,
          n.record_type,
          n.sub_type,
          n.transaction_datetime,
          n.transaction_datetime_raw,
          n.scan_lat,
          n.scan_lng,
          n.scan_location_source,
          n.scan_location_accuracy,
          n.scan_location_time,
          to_char(n.transaction_datetime_kuwait_ts, 'YYYY-MM-DD HH24:MI:SS') AS transaction_datetime_kuwait,
          n.received_at
        FROM normalized n
        LEFT JOIN devices d ON d.device_id = n.device_id
        LEFT JOIN buses b ON b.device_id = n.device_id
        ORDER BY n.id DESC
        LIMIT $1
      `,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        transaction_datetime_kuwait:
          row.transaction_datetime_kuwait || parseRawWithOffset(row.transaction_datetime_raw, deviceTimeOffsetHours)
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/bus-locations/latest", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (l.device_id)
        l.device_id,
        COALESCE(l.bus_no, b.bus_code, d.bus_no) AS bus_no,
        COALESCE(r.route_code, d.route_no) AS route_no,
        COALESCE(r.route_name, d.route_name) AS route_name,
        l.lat,
        l.lng,
        l.speed,
        l.bearing,
        l.source,
        l.location_time,
        l.received_at
      FROM bus_locations l
      LEFT JOIN devices d ON d.device_id = l.device_id
      LEFT JOIN buses b ON b.device_id = l.device_id AND b.deleted_at IS NULL
      LEFT JOIN routes r ON r.id = b.active_route_id AND r.deleted_at IS NULL
      WHERE l.lat IS NOT NULL AND l.lng IS NOT NULL
      ORDER BY l.device_id, l.location_time DESC NULLS LAST, l.received_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});
