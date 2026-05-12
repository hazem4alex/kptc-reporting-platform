import express from "express";
import { createToken, hashPassword, verifyPassword } from "./auth.js";
import { pool } from "./db.js";
import { requireApiKey, requireAuth } from "./middleware.js";
import { applyMoneyScale, parseDateTime, parseNumeric, parsePositiveInt, parseRawWithOffset, requiredString } from "./utils.js";

export const router = express.Router();

const configuredDeviceTimeOffset = Number(process.env.DEVICE_TIME_OFFSET_HOURS ?? -5);
const deviceTimeOffsetHours = Number.isFinite(configuredDeviceTimeOffset)
  ? configuredDeviceTimeOffset
  : -5;

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

router.post("/api/transactions/bulk", requireApiKey, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const body = req.body || {};
    const deviceId = requiredString(body.device_id, "device_id");
    const routeExtra = body.route_extra === undefined ? null : JSON.stringify(body.route_extra);
    const transactions = Array.isArray(body.transactions) ? body.transactions : [];

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
      const result = await client.query(
        `
          INSERT INTO transactions (
            record_uid, device_id, record_index, sequence_no, card_no, card_type,
            card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
            amount_display_kwd, amount_copy_raw, transaction_datetime,
            transaction_datetime_raw, record_type, sub_type, crc, source_file, payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (record_uid) DO NOTHING
        `,
        [
          recordUid,
          deviceId,
          parseNumeric(tx.record_index),
          tx.sequence_no ?? null,
          tx.card_no ?? null,
          tx.card_type ?? null,
          tx.card_expiry ?? null,
          tx.counter ?? null,
          parseNumeric(tx.balance_raw),
          parseNumeric(tx.balance_display_kwd),
          parseNumeric(tx.amount_raw),
          parseNumeric(tx.amount_display_kwd),
          parseNumeric(tx.amount_copy_raw),
          parseDateTime(tx.transaction_datetime),
          tx.transaction_datetime_raw ?? null,
          tx.record_type ?? null,
          tx.sub_type ?? null,
          tx.crc ?? null,
          body.source_file ?? null,
          tx
        ]
      );
      accepted += result.rowCount;
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
        parseNumeric(body.lat),
        parseNumeric(body.lng),
        parseNumeric(body.speed),
        parseNumeric(body.bearing),
        body.source ?? null,
        parseDateTime(body.location_time)
      ]
    );

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/summary", async (req, res, next) => {
  try {
    const result = await pool.query(`
      WITH normalized AS (
        SELECT
          amount_display_kwd,
          transaction_datetime,
          ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
        FROM transactions
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
            amount_display_kwd,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions
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
        COUNT(t.id)::bigint AS total_transactions,
        COALESCE(SUM(t.amount_display_kwd), 0)::numeric(14,3) AS total_revenue_kwd,
        MAX(t.transaction_datetime) AS last_transaction_at
      FROM devices d
      LEFT JOIN transactions t ON t.device_id = d.device_id
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
    const { device_id: deviceId, card_no: cardNo, from, to } = req.query;

    const rows = await pool.query(
      `
        WITH normalized AS (
          SELECT
            id, record_uid, device_id, record_index, sequence_no, card_no, card_type,
            card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
            amount_display_kwd, amount_copy_raw, transaction_datetime,
            transaction_datetime_raw, record_type, sub_type, crc, source_file, received_at,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions
        )
        SELECT
          id, record_uid, device_id, record_index, sequence_no, card_no, card_type,
          card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
          amount_display_kwd, amount_copy_raw, transaction_datetime,
          transaction_datetime_raw,
          to_char(transaction_datetime_kuwait_ts, 'YYYY-MM-DD HH24:MI:SS') AS transaction_datetime_kuwait,
          record_type, sub_type, crc, source_file, received_at
        FROM normalized
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime_kuwait_ts::date >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime_kuwait_ts::date <= $4::date)
        ORDER BY id DESC
        LIMIT $5 OFFSET $6
      `,
      [deviceId || null, cardNo || null, from || null, to || null, limit, offset]
    );

    const count = await pool.query(
      `
        WITH normalized AS (
          SELECT
            device_id,
            card_no,
            ${rawWithDeviceOffsetSql} AS transaction_datetime_kuwait_ts
          FROM transactions
        )
        SELECT COUNT(*)::bigint AS total
        FROM normalized
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime_kuwait_ts::date >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime_kuwait_ts::date <= $4::date)
      `,
      [deviceId || null, cardNo || null, from || null, to || null]
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
        COALESCE(card_type, 'unknown') AS card_type,
        COUNT(*)::bigint AS transaction_count,
        COALESCE(SUM(amount_display_kwd), 0)::numeric(14,3) AS revenue_kwd
      FROM transactions
      GROUP BY COALESCE(card_type, 'unknown')
      ORDER BY transaction_count DESC, card_type ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get("/api/reports/bus-locations/latest", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (l.device_id)
        l.device_id,
        COALESCE(l.bus_no, d.bus_no) AS bus_no,
        d.route_no,
        l.lat,
        l.lng,
        l.speed,
        l.bearing,
        l.source,
        l.location_time,
        l.received_at
      FROM bus_locations l
      LEFT JOIN devices d ON d.device_id = l.device_id
      ORDER BY l.device_id, l.location_time DESC NULLS LAST, l.received_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});
