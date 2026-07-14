import { useMemo, useState } from "react";
import { KpiCard } from "../components/KpiCard.jsx";
import { Table } from "../components/Table.jsx";
import { count, day, kwd } from "../format.js";

const presetIds = ["all", "year", "month", "day", "custom"];

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function dateValue(value) {
  const date = new Date(`${toInputDate(value)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rangeForPreset(preset, rows) {
  const latest = rows
    .map((row) => dateValue(row.date))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  if (!latest || preset === "all") return { from: "", to: "" };

  const from = new Date(latest);
  const to = new Date(latest);

  if (preset === "year") {
    from.setMonth(0, 1);
    to.setMonth(11, 31);
  }

  if (preset === "month") {
    from.setDate(1);
    to.setMonth(to.getMonth() + 1, 0);
  }

  return {
    from: toInputDate(from.toISOString()),
    to: toInputDate(to.toISOString())
  };
}

function withinRange(row, from, to) {
  const value = dateValue(row.date);
  const start = dateValue(from);
  const end = dateValue(to);

  if (!value) return false;
  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

export function Overview({ data, t }) {
  const summary = data.summary || {};
  const daily = data.daily || [];
  const devices = data.devices || [];
  const drivers = data.drivers || [];
  const stations = data.stations || [];
  const topRoutes = data.topRoutes || [];
  const topStations = data.topStations || [];
  const transactions = data.transactions || [];

  const [preset, setPreset] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });

  const filteredDaily = useMemo(() => {
    if (!range.from && !range.to) return daily;
    return daily.filter((row) => withinRange(row, range.from, range.to));
  }, [daily, range]);

  const revenue = sum(filteredDaily, "revenue_kwd");
  const trips = sum(filteredDaily, "transaction_count");
  const displayedTrips = daily.length ? trips : Number(summary.total_transactions || 0);
  const displayedRevenue = daily.length ? revenue : Number(summary.total_revenue_kwd || 0);
  const activeDevices = devices.filter((device) => device.last_seen_at).length;
  const displayedActiveDevices = devices.length ? activeDevices : Number(summary.active_devices || 0);
  const activeDrivers = drivers.filter((driver) => driver.is_active !== false).length;
  const activeStations = stations.filter((station) => station.is_active !== false).length;
  const avgFare = trips ? revenue / trips : 0;
  const peakDay = filteredDaily.reduce(
    (top, row) => (Number(row.revenue_kwd || 0) > Number(top.revenue_kwd || 0) ? row : top),
    {}
  );

  function applyPreset(nextPreset) {
    setPreset(nextPreset);
    setRange(rangeForPreset(nextPreset, daily));
  }

  return (
    <section className="page overview-page">
      <div className="hero-dashboard">
        <div>
          <p className="eyebrow">{t("opsCommand")}</p>
          <h1>{t("fleetIntelligence")}</h1>
          <p className="hero-copy">{t("heroDesc")}</p>
        </div>
        <div className="last-sync">
          <span>{t("latestTransaction")}</span>
          <strong>{summary.last_transaction_kuwait || "-"}</strong>
        </div>
      </div>

      <section className="filter-bar" aria-label="Overview filters">
        <div className="segmented-control">
          {presetIds.map((id) => (
            <button
              className={preset === id ? "active" : ""}
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
            >
              {t(id)}
            </button>
          ))}
        </div>
        <label>
          <span>{t("from")}</span>
          <input
            type="date"
            value={range.from}
            onChange={(event) => {
              setPreset("custom");
              setRange((current) => ({ ...current, from: event.target.value }));
            }}
          />
        </label>
        <label>
          <span>{t("to")}</span>
          <input
            type="date"
            value={range.to}
            onChange={(event) => {
              setPreset("custom");
              setRange((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </label>
      </section>

      <div className="row g-3">
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("filteredTransactions")} value={count(displayedTrips)} tone="green" />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("filteredRevenue")} value={kwd(displayedRevenue)} tone="blue" />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("averageFare")} value={kwd(avgFare)} tone="amber" />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("peakRevenueDay")} value={peakDay.date ? day(peakDay.date) : "-"} tone="red" />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("activeDevices")} value={count(displayedActiveDevices)} />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("activeDrivers")} value={count(activeDrivers)} tone="green" />
        </div>
        <div className="col-12 col-sm-6 col-md-4 col-xl">
          <KpiCard label={t("activeStations")} value={count(activeStations)} tone="blue" />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <Panel title={t("revenueTrend")} meta={t("dailyKwd")}>
            <BarChart rows={filteredDaily.slice(0, 12).reverse()} />
          </Panel>
        </div>
        <div className="col-12 col-xl-6">
          <Panel title={t("fleetGauge")} meta={`${count(displayedActiveDevices)} ${t("reportingDevices")}`}>
            <Gauge value={devices.length ? Math.round((displayedActiveDevices / devices.length) * 100) : 0} />
          </Panel>
        </div>
        <div className="col-12 col-xl-6">
          <Panel title={t("topStationsByRevenue")} meta={t("top10ByRevenue")}>
            <RankedRevenueChart
              rows={topStations}
              getKey={(row) => row.station_id || row.name_en || row.name_ar}
              getLabel={(row) => row.name_en || row.name_ar || t("stationUnavailable")}
              t={t}
            />
          </Panel>
        </div>
        <div className="col-12 col-xl-6">
          <Panel title={t("topRoutesByRevenue")} meta={t("top10ByRevenue")}>
            <RankedRevenueChart
              rows={topRoutes}
              getKey={(row) => row.route_id || row.route_code || row.route_name}
              getLabel={(row) => {
                const code = row.route_code || "";
                const name = row.route_name || t("unassigned");
                return code && name !== code ? `${code} — ${name}` : name;
              }}
              t={t}
            />
          </Panel>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <Panel title={t("latestTransactionsPanel")} meta={t("orderedByUpload")}>
            <Table
              rows={transactions.slice(0, 8)}
              getKey={(row) => row.id}
              columns={[
                { key: "transaction_datetime_kuwait", label: t("transactionTime"), render: (row) => row.transaction_datetime_kuwait || "-" },
                { key: "device_id", label: t("device") },
                { key: "card_no", label: t("card") },
                { key: "amount_corrected", label: t("amount"), render: (row) => kwd(row.amount_corrected) }
              ]}
            />
          </Panel>
        </div>
        <div className="col-12 col-lg-6">
          <Panel title={t("revenueByDay")} meta={t("filteredRange")}>
            <Table
              rows={filteredDaily.slice(0, 8)}
              getKey={(row) => row.date}
              columns={[
                { key: "date", label: t("date"), render: (row) => day(row.date) },
                { key: "transaction_count", label: t("trips"), render: (row) => count(row.transaction_count) },
                { key: "revenue_kwd", label: t("revenue"), render: (row) => kwd(row.revenue_kwd) }
              ]}
            />
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({ title, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function BarChart({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.revenue_kwd || 0)), 1);

  return (
    <div className="bar-chart">
      {rows.map((row) => {
        const value = Number(row.revenue_kwd || 0);
        return (
          <div className="bar-item" key={row.date}>
            <div className="bar-track">
              <span style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
            </div>
            <small>{String(row.date).slice(5)}</small>
          </div>
        );
      })}
    </div>
  );
}

function Gauge({ value }) {
  const clamped = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div className="gauge">
      <div className="gauge-arc" style={{ "--gauge-value": `${clamped}%` }}>
        <div>
          <strong>{clamped}%</strong>
          <span>active</span>
        </div>
      </div>
      <div className="gauge-scale">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function RankedRevenueChart({ rows, getKey, getLabel, t }) {
  const visibleRows = rows.slice(0, 10);
  const max = Math.max(...visibleRows.map((row) => Number(row.revenue_kwd || 0)), 1);

  if (!visibleRows.length) {
    return <div className="empty-chart">{t("noRevenueData")}</div>;
  }

  return (
    <div className="ranked-chart">
      {visibleRows.map((row, index) => {
        const revenue = Number(row.revenue_kwd || 0);
        const width = Math.max(4, (revenue / max) * 100);
        return (
          <div className="ranked-row" key={getKey(row) || index}>
            <span className="ranked-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="ranked-main">
              <div className="ranked-label">
                <strong>{getLabel(row)}</strong>
                <span>{count(row.transaction_count)} {t("trips")}</span>
              </div>
              <div className="ranked-track">
                <span style={{ width: `${width}%` }} />
              </div>
            </div>
            <strong className="ranked-value">{kwd(revenue)}</strong>
          </div>
        );
      })}
    </div>
  );
}
