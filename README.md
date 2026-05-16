# KPTC Reporting Platform

Production-ready full-stack reporting platform for KPTC Android E60 bus validator transaction uploads.

## Project Structure

```text
server/   Express API, PostgreSQL schema, ingestion, reports
web/      React dashboard built with Vite
README.md
```

## Local Development

### 1. PostgreSQL

Create a local database:

```bash
createdb kptc_reporting
```

Copy the server environment file:

```bash
cp server/.env.example server/.env
```

Update `server/.env` if your local PostgreSQL URL differs:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/kptc_reporting
API_KEY=change-me
PORT=4000
DEVICE_TIME_OFFSET_HOURS=-5
```

The server creates these tables automatically on startup if they do not exist:

- `devices`
- `routes`
- `buses`
- `route_change_logs`
- `transactions`
- `bus_locations`
- `sync_batches`
- `app_users`
- `auth_sessions`

### 2. Server

```bash
cd server
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:4000/health
```

### 3. Web Dashboard

Copy the web environment file:

```bash
cp web/.env.example web/.env
```

Run the dashboard:

```bash
cd web
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

Default dashboard login after the API starts:

- Username: `admin`
- Password: `Admin@123`

## API

Write endpoints require `x-api-key`. Dashboard auth endpoints use bearer session tokens. Reporting endpoints are read-only and currently do not require the key.

### Dashboard Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'
```

### Bulk Transaction Upload

```bash
curl -X POST http://localhost:4000/api/transactions/bulk \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me" \
  -d '{
    "device_id": "E60_TEST_001",
    "bus_no": "BUS-101",
    "route_no": "15",
    "route_name": "Kuwait City - Salmiya",
    "route_extra": {
      "direction": "outbound"
    },
    "source_file": "/data/e60apay_en/0/log/log_0000000000",
    "record_size": 2048,
    "file_size": 157696,
    "record_count": 77,
    "last_uploaded_count": 0,
    "new_count": 1,
    "location": null,
    "transactions": [
      {
        "record_index": 1,
        "sequence_no": "0000000091",
        "record_uid": "E60_TEST_001-0000000091-2802101600000011-20250707214304-250-08-0014C0A6",
        "card_no": "2802101600000011",
        "card_type": "0300",
        "card_expiry": "20260702",
        "counter": "000004",
        "balance_raw": 4250,
        "balance_display_kwd": "4.250",
        "amount_raw": 250,
        "amount_display_kwd": "0.250",
        "amount_copy_raw": 250,
        "transaction_datetime": "2025-07-07 21:43:04",
        "transaction_datetime_raw": "20250707214304",
        "record_type": "08",
        "sub_type": "020001",
        "crc": "0014C0A6"
      }
    ]
  }'
```

Response:

```json
{
  "success": true,
  "accepted": 1,
  "duplicates": 0,
  "received": 1
}
```

The deduplication key is `record_uid`. The server uses `ON CONFLICT(record_uid) DO NOTHING`, so repeated uploads are safe.

Root-level `bus_no`, `route_no`, `route_name`, and `route_extra` are upserted into `devices` on every bulk upload.

### Routes and Buses

Route and bus management endpoints require dashboard bearer auth:

```bash
TOKEN="$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).token')"

curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/routes

curl -X POST http://localhost:4000/api/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"route_code":"25","route_name":"Route 25 - Hawally","fare_fils":250}'

curl -X PUT http://localhost:4000/api/routes/R25 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"route_code":"25","route_name":"Route 25 - Hawally","fare_fils":300,"is_active":true}'

curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/buses

curl -X POST http://localhost:4000/api/buses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"bus_code":"BUS-103","plate_number":"KPTC-103","device_id":"E60_TEST_003","active_route_id":"R12"}'

curl -X PUT http://localhost:4000/api/buses/BUS-101/active-route \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"active_route_id":"R15"}'
```

Changing a bus active route increments `route_config_version` and writes a `route_change_logs` row.

### Device Active Route Sync

The E60 sync tool can read the assigned active route and fare with the same `x-api-key` mechanism as transaction upload:

```bash
curl http://localhost:4000/api/devices/E60_TEST_001/active-route \
  -H "x-api-key: change-me"
```

Success response:

```json
{
  "success": true,
  "device_id": "E60_TEST_001",
  "bus_id": "BUS-101",
  "version": 3,
  "route_id": "R12",
  "route_code": "12",
  "route_name": "Route 12 - Salmiya",
  "fare_fils": 250,
  "updated_at": "2026-05-17T10:00:00.000Z"
}
```

Missing device returns `{"success":false,"error":"DEVICE_NOT_FOUND"}` with HTTP 404. A bus without an assigned route returns `{"success":false,"error":"NO_ACTIVE_ROUTE"}` with HTTP 404.

### Bus Location Upload

```bash
curl -X POST http://localhost:4000/api/buses/location \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me" \
  -d '{
    "device_id": "E60_TEST_001",
    "bus_no": "BUS-101",
    "route_no": "15",
    "lat": 29.3759000,
    "lng": 47.9774000,
    "speed": 35.5,
    "bearing": 120.0,
    "source": "device-gps",
    "location_time": "2025-07-07 21:44:00"
  }'
```

### Reporting Endpoints

```bash
curl http://localhost:4000/api/reports/summary
curl "http://localhost:4000/api/reports/daily?from=2025-07-01&to=2025-07-31"
curl http://localhost:4000/api/reports/devices
curl "http://localhost:4000/api/reports/transactions?limit=100&offset=0&device_id=E60_TEST_001"
curl http://localhost:4000/api/reports/card-types
curl http://localhost:4000/api/reports/bus-locations/latest
```

## Business Logic Notes

- `record_uid` is the only deduplication key.
- `amount_raw` is stored exactly as received.
- `amount_display_kwd` is stored exactly as received and used for revenue reports.
- The API never asks the device to delete original log files.
- The device should update its local upload state only after HTTP `200` or `201`.
- Duplicate uploads return success with `duplicates` counted, so retry logic can be simple.
- E60 `transaction_datetime_raw` is not treated as browser-local time.
- Reports use `DEVICE_TIME_OFFSET_HOURS`, default `-5`, through `parseRawWithOffset(raw, offsetHours)`.
- The corrected display/reporting field is `transaction_datetime_kuwait`.
- Daily reports group by the corrected display date.
- Latest transactions are ordered by `id DESC`, not by transaction time.
- Dashboard login is database-backed. `initDb()` seeds `admin / Admin@123` if missing.

## Current Production Services

GitHub repository:

- `https://github.com/hazem4alex/kptc-reporting-platform`

Railway project:

- Project name: `KPTC`
- API service: `kptc-api`
- Web service: `kptc-web`
- Database service: `Postgres`
- API URL: `https://kptc-reporting-platform-production.up.railway.app`
- Web URL: `https://kptc-web-production.up.railway.app`

Railway deployment notes:

- API service uses the repository root with root `railway.json`.
- Web service root directory is `web`.
- API should use `DATABASE_URL=${{Postgres.DATABASE_URL}}` for internal Railway database traffic.
- Web should use `VITE_API_BASE_URL=https://kptc-reporting-platform-production.up.railway.app`.
- Set `DEVICE_TIME_OFFSET_HOURS=-5` only if you want to be explicit; the API defaults to `-5`.
- Keep `API_KEY` private. Device write endpoints require it.

## GitHub and Railway API Deployment

### GitHub Repository

This project is ready to publish as a GitHub repository from the project root:

```bash
git init
git add .
git commit -m "Initial KPTC reporting platform"
git branch -M main
git remote add origin https://github.com/<your-user>/kptc-reporting-platform.git
git push -u origin main
```

The `.env` files are ignored and must not be committed.

### Railway API Service

Create a Railway service from the GitHub repository. This repository includes `railway.json`, which tells Railway to deploy the API from `server/` through the root package scripts:

- Build command: `npm run build`
- Start command: `npm start`
- Healthcheck path: `/health`

Set these Railway service variables:

- `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` if the database service is named `Postgres`
- `API_KEY`: a long random secret used by device write requests
- `PORT`: leave unset; Railway injects it automatically

Use Railway's variable autocomplete if your PostgreSQL service has a different name. The referenced `DATABASE_URL` keeps API-to-database traffic on Railway's private network. Do not use the `*.proxy.rlwy.net` TCP proxy URL for the deployed API unless you intentionally want an external database connection.

The server runs schema creation on startup.

### Render API Service

You can still deploy the API to Render as a Web Service:

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment:
  - `DATABASE_URL`: Render PostgreSQL internal connection string
  - `API_KEY`: a long random secret
  - `PORT`: Render sets this automatically; leave unset unless needed

### Web Static Site

The dashboard can be deployed as a separate static site on Railway, Render, Vercel, Netlify, or any static hosting provider:

Railway service settings:

- Root directory: `web`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment:
  - `VITE_API_BASE_URL`: `https://kptc-reporting-platform-production.up.railway.app`

Vite reads `VITE_API_BASE_URL` during the build, so redeploy the web service after changing it.

## Production Checklist

- Use HTTPS-only production URLs for production devices.
- Set a strong `API_KEY` and keep it out of device logs.
- Configure Railway database backups.
- Monitor `/health` from Railway or an external uptime service.
- Keep original E60 log files on the device until your native tool confirms a successful upload response.

## Agent Handoff Notes

Use this section when another coding agent continues the project.

### Repo Context

- Local path used during development: `/Users/Hazem/Desktop/kptc-reporting-platform`
- Branch: `main`
- Stack:
  - API: Express, PostgreSQL, plain `pg`, no ORM
  - Web: Vite, React, plain CSS
  - Deployment: Railway
- Do not commit `.env` files.
- Avoid changing transaction ingestion contracts unless explicitly requested by the device-side tool owner.

### Important Files

- API entrypoint: `server/src/index.js`
- Database schema/init: `server/src/db.js`
- API routes: `server/src/routes.js`
- Auth helpers: `server/src/auth.js`
- Auth/API key middleware: `server/src/middleware.js`
- Time/raw parsing helpers: `server/src/utils.js`
- Web API client: `web/src/api.js`
- Main app shell: `web/src/App.jsx`
- Overview dashboard: `web/src/pages/Overview.jsx`
- Transactions grid: `web/src/pages/Transactions.jsx`
- Users page: `web/src/pages/Users.jsx`
- Translations: `web/src/i18n.js`
- Global styling/design system: `web/src/styles.css`

### Local Commands

```bash
# API
cd server
npm install
npm start

# Web
cd web
npm install
npm run dev

# Production web build check
npm --prefix web run build

# Syntax checks
node --check server/src/routes.js
node --check server/src/db.js
node --check server/src/middleware.js
node --check server/src/auth.js
```

### Current Features

- Device bulk transaction ingestion with dedupe by `record_uid`.
- Device config sync from bulk payload: `bus_no`, `route_no`, `route_name`, `route_extra`.
- Corrected E60 display time via `DEVICE_TIME_OFFSET_HOURS`.
- Dashboard auth with seeded admin user.
- Users page for adding users.
- Overview analytics with KPI cards, bar chart, donut chart, pie chart, gauge, and date filters.
- Transactions page with search, filters, sorting, and grouping.
- Devices, card types, and live map pages.
- Collapsible sidebar, English/Arabic selection, and light/dark mode.

### Design Direction

The UI has been pushed toward a premium transport command-center style:

- Dark ink sidebar.
- Pale command canvas in light mode.
- High-contrast dark mode.
- KPTC red as the primary accent.
- Soft glass/double-bezel panels.
- Large, heavy dashboard typography.

Skills previously used for the design pass:

- `gpt-taste`
- `redesign-existing-projects`
- `high-end-visual-design`
- `image-to-code`

If redesigning again, keep it operational and dashboard-focused. Avoid marketing-page hero patterns, decorative card spam, and changes that reduce table readability.

### Non-Negotiable Constraints

- Do not change `record_uid`.
- Do not modify the device sync payload unless the user explicitly requests it.
- Do not delete or mutate existing transaction rows for display-only fixes.
- Do not rely on browser timezone conversion for E60 transaction display time.
- Keep latest transactions ordered by `id DESC` or `received_at DESC`, not corrected transaction time.
- Preserve Railway internal database connection through `${{Postgres.DATABASE_URL}}`.
