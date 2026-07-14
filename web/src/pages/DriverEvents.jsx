import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";
import { count, dateTime } from "../format.js";

function includes(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

export function DriverEvents({ rows = [], t }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (eventType !== "all" && row.event_type !== eventType) return false;
      if (!normalizedQuery) return true;
      return [
        row.card_no,
        row.card_type,
        row.device_id,
        row.bus_number,
        row.route_no,
        row.route_name,
        row.record_uid
      ].some((value) => includes(value, normalizedQuery));
    });
  }, [eventType, query, rows]);

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
          <span>{t("eventType")}</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
            <option value="all">{t("allEvents")}</option>
            <option value="login">{t("login")}</option>
            <option value="logout">{t("logoutEvent")}</option>
          </select>
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
            { key: "card_no", label: t("driverCardNumber") },
            { key: "card_type", label: t("cardType") },
            { key: "bus_number", label: t("busNumber"), render: (row) => row.bus_number || "-" },
            { key: "device_id", label: t("deviceId") },
            { key: "route_name", label: t("routeName"), render: (row) => row.route_name || row.route_no || "-" },
            { key: "record_type", label: t("recordType") }
          ]}
        />
      </section>
    </section>
  );
}
