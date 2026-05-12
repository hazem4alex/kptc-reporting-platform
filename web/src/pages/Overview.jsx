import { useMemo, useState } from "react";
import { KpiCard } from "../components/KpiCard.jsx";
import { Table } from "../components/Table.jsx";
import { count, day, kwd } from "../format.js";

const presets = [
  { id: "all", label: "All" },
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "day", label: "Day" },
  { id: "custom", label: "Custom" }
];

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

export function Overview({ data }) {
  const summary = data.summary || {};
  const daily = data.daily || [];
  const cardTypes = data.cardTypes || [];
  const devices = data.devices || [];
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
          <p className="eyebrow">Operations command</p>
          <h1>KPTC fleet revenue intelligence</h1>
          <p className="hero-copy">
            Fare uploads, route activity, device health, and revenue trend reporting in one control view.
          </p>
        </div>
        <div className="last-sync">
          <span>Latest transaction</span>
          <strong>{summary.last_transaction_kuwait || "-"}</strong>
        </div>
      </div>

      <section className="filter-bar" aria-label="Overview filters">
        <div className="segmented-control">
          {presets.map((item) => (
            <button
              className={preset === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label>
          <span>From</span>
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
          <span>To</span>
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

      <div className="kpi-grid">
        <KpiCard label="Filtered transactions" value={count(displayedTrips)} tone="green" />
        <KpiCard label="Filtered revenue" value={kwd(displayedRevenue)} tone="blue" />
        <KpiCard label="Average fare" value={kwd(avgFare)} tone="amber" />
        <KpiCard label="Peak revenue day" value={peakDay.date ? day(peakDay.date) : "-"} tone="red" />
        <KpiCard label="Active devices" value={count(activeDevices || summary.active_devices)} />
      </div>

      <div className="analytics-grid">
        <Panel title="Revenue trend" meta="Daily KWD">
          <BarChart rows={filteredDaily.slice(0, 12).reverse()} />
        </Panel>
        <Panel title="Card mix" meta="Share by transactions">
          <DonutChart rows={cardTypes.slice(0, 5)} />
        </Panel>
        <Panel title="Revenue split" meta="Top fare categories">
          <PieChart rows={cardTypes.slice(0, 5)} />
        </Panel>
        <Panel title="Fleet upload gauge" meta={`${count(activeDevices)} reporting devices`}>
          <Gauge value={devices.length ? Math.round((activeDevices / devices.length) * 100) : 0} />
        </Panel>
      </div>

      <div className="grid two">
        <Panel title="Latest transactions" meta="Ordered by latest upload">
          <Table
            rows={transactions.slice(0, 8)}
            getKey={(row) => row.id}
            columns={[
              { key: "transaction_datetime_kuwait", label: "Transaction Time", render: (row) => row.transaction_datetime_kuwait || "-" },
              { key: "device_id", label: "Device" },
              { key: "card_no", label: "Card" },
              { key: "amount_display_kwd", label: "Amount", render: (row) => kwd(row.amount_display_kwd) }
            ]}
          />
        </Panel>

        <Panel title="Revenue by day" meta="Filtered reporting range">
          <Table
            rows={filteredDaily.slice(0, 8)}
            getKey={(row) => row.date}
            columns={[
              { key: "date", label: "Date", render: (row) => day(row.date) },
              { key: "transaction_count", label: "Trips", render: (row) => count(row.transaction_count) },
              { key: "revenue_kwd", label: "Revenue", render: (row) => kwd(row.revenue_kwd) }
            ]}
          />
        </Panel>
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

function DonutChart({ rows }) {
  const total = Math.max(sum(rows, "transaction_count"), 1);
  let offset = 25;

  return (
    <div className="donut-layout">
      <svg className="donut-chart" viewBox="0 0 42 42" role="img" aria-label="Card type transaction mix">
        <circle className="donut-base" cx="21" cy="21" r="15.915" />
        {rows.map((row, index) => {
          const value = (Number(row.transaction_count || 0) / total) * 100;
          const dash = `${value} ${100 - value}`;
          const currentOffset = offset;
          offset -= value;
          return (
            <circle
              className={`donut-segment segment-${index + 1}`}
              cx="21"
              cy="21"
              key={row.card_type}
              r="15.915"
              strokeDasharray={dash}
              strokeDashoffset={currentOffset}
            />
          );
        })}
      </svg>
      <div className="chart-legend">
        {rows.map((row, index) => (
          <span key={row.card_type}>
            <i className={`legend-dot segment-bg-${index + 1}`} />
            {row.card_type} · {count(row.transaction_count)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PieChart({ rows }) {
  const total = Math.max(sum(rows, "revenue_kwd"), 1);
  let cumulative = 0;
  const gradient = rows
    .map((row, index) => {
      const value = (Number(row.revenue_kwd || 0) / total) * 100;
      const start = cumulative;
      cumulative += value;
      return `var(--segment-${index + 1}) ${start}% ${cumulative}%`;
    })
    .join(", ");

  return (
    <div className="pie-layout">
      <div className="pie-chart" style={{ background: `conic-gradient(${gradient || "var(--line) 0 100%"})` }}>
        <strong>{kwd(total)}</strong>
        <span>revenue</span>
      </div>
      <div className="chart-legend">
        {rows.map((row, index) => (
          <span key={row.card_type}>
            <i className={`legend-dot segment-bg-${index + 1}`} />
            {row.card_type} · {kwd(row.revenue_kwd)}
          </span>
        ))}
      </div>
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
