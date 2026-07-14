import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";
import { count, dateTime } from "../format.js";
import {
  buildLatestLocationsByDevice,
  locationDetails,
  locationMethodLabelFromDetails,
  nearestStationText,
  NearestStationCell,
  ScanLocationCell,
  LocationMethodCell
} from "../locationDisplay.jsx";

function includes(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function eventDate(row) {
  return String(row.transaction_datetime_kuwait || row.transaction_datetime || "").slice(0, 10);
}

function driverKey(row) {
  return row.driver_id || row.card_no || "";
}

function driverLabel(row) {
  const name = row.driver_name_en || row.driver_name_ar || "";
  const card = row.card_no || "";
  const civilId = row.driver_civil_id || "";
  if (name && civilId) return `${name} · ${civilId}`;
  if (name && card) return `${name} · ${card}`;
  return name || card || "-";
}

export function DriverEvents({ rows = [], locations = [], stations = [], t }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [driver, setDriver] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const latestLocationsByDevice = useMemo(() => buildLatestLocationsByDevice(locations), [locations]);

  const drivers = useMemo(() => {
    const options = new Map();
    for (const row of rows) {
      const value = driverKey(row);
      if (value) options.set(value, driverLabel(row));
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [rows]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const details = locationDetails(row, latestLocationsByDevice);
      if (eventType !== "all" && row.event_type !== eventType) return false;
      if (driver !== "all" && driverKey(row) !== driver) return false;
      const date = eventDate(row);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (!normalizedQuery) return true;
      return [
        row.card_no,
        row.card_type,
        row.driver_name_en,
        row.driver_name_ar,
        row.driver_civil_id,
        row.driver_phone_number,
        row.device_id,
        row.bus_number,
        row.route_no,
        row.route_name,
        details?.lat,
        details?.lng,
        details?.source,
        details?.accuracy,
        locationMethodLabelFromDetails(details, t),
        nearestStationText(details, stations, t),
        row.record_uid
      ].some((value) => includes(value, normalizedQuery));
    });
  }, [driver, eventType, from, latestLocationsByDevice, query, rows, stations, t, to]);

  const loginCount = filtered.filter((row) => row.event_type === "login").length;
  const logoutCount = filtered.filter((row) => row.event_type === "logout").length;

  return (
    <section className="page driver-events-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("driverOperations")}</p>
          <h1>{t("driverLoginLogout")}</h1>
        </div>
        <div className="transaction-summary">
          <span>{count(filtered.length)} {t("events")}</span>
          <strong>{count(loginCount)} {t("login")} · {count(logoutCount)} {t("logoutEvent")}</strong>
        </div>
      </div>

      <section className="filter-panel driver-event-filters" aria-label={t("driverEventFilters")}>
        <label className="field wide">
          <span>{t("search")}</span>
          <input
            placeholder={t("driverSearchPlaceholder")}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("driver")}</span>
          <select value={driver} onChange={(event) => setDriver(event.target.value)}>
            <option value="all">{t("allDrivers")}</option>
            {drivers.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("eventType")}</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
            <option value="all">{t("allEvents")}</option>
            <option value="login">{t("login")}</option>
            <option value="logout">{t("logoutEvent")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("from")}</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          <span>{t("to")}</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{t("driverActivity")}</h2>
          <span>{count(filtered.length)} {t("rows")}</span>
        </div>
        <Table
          rows={filtered}
          getKey={(row) => row.id}
          columns={[
            {
              key: "transaction_datetime_kuwait",
              label: t("eventTime"),
              render: (row) => row.transaction_datetime_kuwait || dateTime(row.transaction_datetime)
            },
            {
              key: "event_type",
              label: t("eventType"),
              render: (row) => (
                <span className={`status-pill ${row.event_type === "login" ? "active" : "inactive"}`}>
                  {t(row.event_type === "login" ? "login" : "logoutEvent")}
                </span>
              )
            },
            { key: "driver", label: t("driver"), render: driverLabel },
            { key: "card_no", label: t("driverCardNumber") },
            { key: "card_type", label: t("cardType") },
            { key: "bus_number", label: t("busNumber"), render: (row) => row.bus_number || "-" },
            { key: "device_id", label: t("deviceId") },
            { key: "route_name", label: t("routeName"), render: (row) => row.route_name || row.route_no || "-" },
            { key: "scan_location", label: t("latestLocation"), render: (row) => <ScanLocationCell details={locationDetails(row, latestLocationsByDevice)} t={t} /> },
            { key: "scan_location_method", label: t("locationMethod"), render: (row) => <LocationMethodCell details={locationDetails(row, latestLocationsByDevice)} t={t} /> },
            { key: "nearest_station", label: t("nearestStation"), render: (row) => <NearestStationCell details={locationDetails(row, latestLocationsByDevice)} stations={stations} t={t} /> },
            { key: "record_type", label: t("recordType") }
          ]}
        />
      </section>
    </section>
  );
}
