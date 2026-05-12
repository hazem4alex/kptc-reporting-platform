import { KpiCard } from "../components/KpiCard.jsx";
import { Table } from "../components/Table.jsx";
import { count, day, kwd } from "../format.js";

export function Overview({ data }) {
  const summary = data.summary || {};

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations dashboard</p>
          <h1>KPTC Reporting Platform</h1>
        </div>
        <div className="last-sync">Last transaction: {summary.last_transaction_kuwait || "-"}</div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total transactions" value={count(summary.total_transactions)} tone="green" />
        <KpiCard label="Total revenue" value={kwd(summary.total_revenue_kwd)} tone="blue" />
        <KpiCard label="Today transactions" value={count(summary.today_transactions)} tone="amber" />
        <KpiCard label="Today revenue" value={kwd(summary.today_revenue_kwd)} tone="red" />
        <KpiCard label="Active devices" value={count(summary.active_devices)} />
      </div>

      <div className="grid two">
        <Panel title="Latest transactions">
          <Table
            rows={(data.transactions || []).slice(0, 8)}
            getKey={(row) => row.id}
            columns={[
              { key: "transaction_datetime_kuwait", label: "Transaction Time", render: (row) => row.transaction_datetime_kuwait || "-" },
              { key: "device_id", label: "Device" },
              { key: "card_no", label: "Card" },
              { key: "amount_display_kwd", label: "Amount", render: (row) => kwd(row.amount_display_kwd) }
            ]}
          />
        </Panel>

        <Panel title="Revenue by day">
          <Table
            rows={(data.daily || []).slice(0, 8)}
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

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
