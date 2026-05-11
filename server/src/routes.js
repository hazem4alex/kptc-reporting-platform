import express from "express";
import { pool } from "./db.js";
import { requireApiKey } from "./middleware.js";
import { parseDateTime, parseNumeric, parsePositiveInt, requiredString } from "./utils.js";

export const router = express.Router();

router.get("/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, status: "ok" });
  } catch (err) {
    next(err);
  }
});

router.post("/api/transactions/bulk", requireApiKey, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const body = req.body || {};
    const deviceId = requiredString(body.device_id, "device_id");
    const transactions = Array.isArray(body.transactions) ? body.transactions : [];

    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO devices (device_id, last_seen_at)
        VALUES ($1, now())
        ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now()
      `,
      [deviceId]
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
      SELECT
        COUNT(*)::bigint AS total_transactions,
        COALESCE(SUM(amount_display_kwd), 0)::numeric(14,3) AS total_revenue_kwd,
        COUNT(*) FILTER (WHERE transaction_datetime >= CURRENT_DATE)::bigint AS today_transactions,
        COALESCE(SUM(amount_display_kwd) FILTER (WHERE transaction_datetime >= CURRENT_DATE), 0)::numeric(14,3) AS today_revenue_kwd,
        (SELECT COUNT(*)::bigint FROM devices WHERE last_seen_at >= now() - interval '24 hours') AS active_devices,
        MAX(transaction_datetime) AS last_transaction_at
      FROM transactions
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
        SELECT
          transaction_datetime::date AS date,
          COUNT(*)::bigint AS transaction_count,
          COALESCE(SUM(amount_display_kwd), 0)::numeric(14,3) AS revenue_kwd
        FROM transactions
        WHERE ($1::date IS NULL OR transaction_datetime >= $1::date)
          AND ($2::date IS NULL OR transaction_datetime < ($2::date + interval '1 day'))
        GROUP BY transaction_datetime::date
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
        SELECT
          id, record_uid, device_id, record_index, sequence_no, card_no, card_type,
          card_expiry, counter, balance_raw, balance_display_kwd, amount_raw,
          amount_display_kwd, amount_copy_raw, transaction_datetime,
          transaction_datetime_raw, record_type, sub_type, crc, source_file, received_at
        FROM transactions
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime < ($4::date + interval '1 day'))
        ORDER BY transaction_datetime DESC NULLS LAST, received_at DESC
        LIMIT $5 OFFSET $6
      `,
      [deviceId || null, cardNo || null, from || null, to || null, limit, offset]
    );

    const count = await pool.query(
      `
        SELECT COUNT(*)::bigint AS total
        FROM transactions
        WHERE ($1::text IS NULL OR device_id = $1)
          AND ($2::text IS NULL OR card_no = $2)
          AND ($3::date IS NULL OR transaction_datetime >= $3::date)
          AND ($4::date IS NULL OR transaction_datetime < ($4::date + interval '1 day'))
      `,
      [deviceId || null, cardNo || null, from || null, to || null]
    );

    res.json({
      success: true,
      data: rows.rows,
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
