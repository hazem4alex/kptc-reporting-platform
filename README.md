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
```

The server creates these tables automatically on startup if they do not exist:

- `devices`
- `transactions`
- `bus_locations`
- `sync_batches`

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

## API

Write endpoints require `x-api-key`. Reporting endpoints are read-only and do not require the key.

### Bulk Transaction Upload

```bash
curl -X POST http://localhost:4000/api/transactions/bulk \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me" \
  -d '{
    "device_id": "E60_TEST_001",
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

Create a Railway service from the GitHub repository. This repository includes `railway.json`, which tells Railway to deploy the API from `server/`:

- Build command: `cd server && npm ci`
- Start command: `cd server && npm start`
- Healthcheck path: `/health`

Set these Railway service variables:

- `DATABASE_URL`: your Railway PostgreSQL connection string
- `API_KEY`: a long random secret used by device write requests
- `PORT`: leave unset; Railway injects it automatically

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

- Root directory: `web`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment:
  - `VITE_API_BASE_URL`: your deployed API URL

## Production Checklist

- Use HTTPS-only production URLs for production devices.
- Set a strong `API_KEY` and keep it out of device logs.
- Configure Railway database backups.
- Monitor `/health` from Railway or an external uptime service.
- Keep original E60 log files on the device until your native tool confirms a successful upload response.
