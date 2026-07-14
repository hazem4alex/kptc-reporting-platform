import test, { after, before } from "node:test";
import assert from "node:assert/strict";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? test : test.skip;
let server;
let baseUrl;
let token;
let pool;
const suffix = Date.now().toString().slice(-8);
const routeCode = `T${suffix}`;
const routeId = `R${routeCode}`;
const secondRouteId = `RX${suffix}`;
const deviceId = `9001${suffix}`;
const busNumber = `9002${suffix}`;
const driverCardType = `D${suffix}`;
const driverSignInUid = `driver-sign-in-${suffix}`;
const driverSignOutUid = `driver-sign-out-${suffix}`;

async function call(path, { method = "GET", body, auth = true, apiKey } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { response, json: await response.json() };
}

before(async () => {
  if (!databaseUrl) return;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.API_KEY = "integration-api-key";
  const db = await import("../src/db.js"); pool = db.pool; await db.initDb();
  const { app } = await import("../src/index.js");
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await call("/api/auth/login", { method: "POST", auth: false, body: { username: "admin", password: "Admin@123" } });
  assert.equal(login.response.status, 200); token = login.json.token;
});

after(async () => {
  if (!databaseUrl) return;
  await pool.query("DELETE FROM route_change_logs WHERE bus_id = $1", [busNumber]).catch(() => {});
  await pool.query("DELETE FROM transactions WHERE device_id = $1", [deviceId]).catch(() => {});
  await pool.query("DELETE FROM sync_batches WHERE device_id = $1", [deviceId]).catch(() => {});
  await pool.query("DELETE FROM card_type_definitions WHERE card_type = $1", [driverCardType]).catch(() => {});
  await pool.query("DELETE FROM buses WHERE id = $1", [busNumber]).catch(() => {});
  await pool.query("DELETE FROM devices WHERE device_id = $1", [deviceId]).catch(() => {});
  await pool.query("DELETE FROM routes WHERE id IN ($1,$2)", [routeId, secondRouteId]).catch(() => {});
  await new Promise((resolve) => server.close(resolve)); await pool.end();
});

suite("route/device configuration flow and regression coverage", async (t) => {
  await t.test("dashboard authentication remains protected", async () => {
    const result = await call("/api/routes", { auth: false }); assert.equal(result.response.status, 401);
  });

  await t.test("creates a 250-fils route", async () => {
    const result = await call("/api/routes", { method: "POST", body: { route_code: routeCode, route_name: "Murqab Test", fare_fils: 250, is_active: true } });
    assert.equal(result.response.status, 201); assert.equal(result.json.data.fare_kwd, "0.250");
  });

  await t.test("registers a device and assigns its route", async () => {
    const result = await call("/api/buses", { method: "POST", body: { device_id: deviceId, bus_number: busNumber, active_route_id: routeId } });
    assert.equal(result.response.status, 201); assert.equal(result.json.data.bus_number, busNumber);
  });

  await t.test("device endpoint returns complete E60 configuration", async () => {
    const result = await call(`/api/devices/${deviceId}/active-route`, { auth: false, apiKey: "integration-api-key" });
    assert.equal(result.response.status, 200); assert.equal(result.json.route_name, "Murqab Test");
    assert.equal(result.json.bus_number, busNumber); assert.equal(result.json.fare_fils, 250); assert.equal(result.json.fare_kwd, "0.250");
  });

  await t.test("rejects an invalid API key", async () => {
    const result = await call(`/api/devices/${deviceId}/active-route`, { auth: false, apiKey: "wrong" }); assert.equal(result.response.status, 401);
  });

  await t.test("route changes increment exactly once and no-op assignments do not", async () => {
    await pool.query("INSERT INTO routes (id, route_code, route_name, fare_fils) VALUES ($1,$2,$3,$4)", [secondRouteId, `X${suffix}`, "Second Test Route", 300]);
    const before = await pool.query("SELECT route_config_version FROM buses WHERE id=$1", [busNumber]);
    const changed = await call(`/api/buses/${busNumber}/active-route`, { method: "PUT", body: { active_route_id: secondRouteId } });
    assert.equal(changed.json.data.route_config_version, before.rows[0].route_config_version + 1);
    const unchanged = await call(`/api/buses/${busNumber}/active-route`, { method: "PUT", body: { active_route_id: secondRouteId } });
    assert.equal(unchanged.json.data.route_config_version, changed.json.data.route_config_version);
  });

  await t.test("fare changes increment assigned device versions", async () => {
    const before = await pool.query("SELECT route_config_version FROM buses WHERE id=$1", [busNumber]);
    const result = await call(`/api/routes/${secondRouteId}`, { method: "PUT", body: { route_code: `X${suffix}`, route_name: "Second Test Route", fare_fils: 350, is_active: true } });
    assert.equal(result.response.status, 200);
    const afterVersion = await pool.query("SELECT route_config_version FROM buses WHERE id=$1", [busNumber]);
    assert.equal(afterVersion.rows[0].route_config_version, before.rows[0].route_config_version + 1);
  });

  await t.test("bulk transaction upload still accepts and deduplicates records", async () => {
    const payload = { device_id: deviceId, source_file: "integration-test", transactions: [{ record_uid: `integration-${suffix}`, amount_raw: 250, amount_display_kwd: "0.250" }] };
    const first = await call("/api/transactions/bulk", { method: "POST", auth: false, apiKey: "integration-api-key", body: payload });
    const duplicate = await call("/api/transactions/bulk", { method: "POST", auth: false, apiKey: "integration-api-key", body: payload });
    assert.equal(first.response.status, 201); assert.equal(first.json.accepted, 1); assert.equal(duplicate.json.duplicates, 1);
  });

  await t.test("driver card types are excluded from financial transactions and exposed as driver events", async () => {
    const cardType = await call(`/api/card-types/${driverCardType}`, {
      method: "PUT",
      body: { is_driver_card: true }
    });
    assert.equal(cardType.response.status, 200);
    assert.equal(cardType.json.data.is_driver_card, true);

    const payload = {
      device_id: deviceId,
      source_file: "driver-events-test",
      transactions: [
        {
          record_uid: driverSignInUid,
          card_no: "DRIVER001",
          card_type: driverCardType,
          record_type: "43",
          amount_raw: 0,
          amount_display_kwd: "0.000",
          transaction_datetime_raw: "20260712070000"
        },
        {
          record_uid: driverSignOutUid,
          card_no: "DRIVER001",
          card_type: driverCardType,
          record_type: "44",
          amount_raw: 0,
          amount_display_kwd: "0.000",
          transaction_datetime_raw: "20260712090000"
        }
      ]
    };

    const upload = await call("/api/transactions/bulk", { method: "POST", auth: false, apiKey: "integration-api-key", body: payload });
    assert.equal(upload.response.status, 201);
    assert.equal(upload.json.accepted, 2);

    const financial = await call(`/api/reports/transactions?limit=100&offset=0&device_id=${deviceId}`, { auth: false });
    assert.equal(financial.response.status, 200);
    assert.equal(financial.json.data.some((row) => row.record_uid === driverSignInUid || row.record_uid === driverSignOutUid), false);

    const events = await call("/api/reports/driver-events?limit=1000", { auth: false });
    assert.equal(events.response.status, 200);
    const byUid = new Map(events.json.data.map((row) => [row.record_uid, row]));
    assert.equal(byUid.get(driverSignInUid)?.event_type, "login");
    assert.equal(byUid.get(driverSignOutUid)?.event_type, "logout");
  });
});
