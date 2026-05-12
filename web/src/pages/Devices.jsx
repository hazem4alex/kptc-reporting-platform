import { Table } from "../components/Table.jsx";
import { count, dateTime, kwd } from "../format.js";

function routeExtra(value) {
  if (value === null || value === undefined || value === "") return "-";
  return typeof value === "object" ? JSON.stringify(value) : value;
}

export function Devices({ rows, t }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("fleetStatus")}</p>
          <h1>{t("devicesAndBuses")}</h1>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.device_id}
          columns={[
            { key: "device_id", label: t("device") },
            { key: "bus_no", label: t("bus") },
            { key: "route_no", label: t("routeNo") },
            { key: "route_name", label: t("routeName"), render: (row) => row.route_name || "-" },
            { key: "route_extra", label: t("routeExtra"), render: (row) => routeExtra(row.route_extra) },
            { key: "last_seen_at", label: t("lastSeen"), render: (row) => dateTime(row.last_seen_at) },
            { key: "total_transactions", label: t("transactionCount"), render: (row) => count(row.total_transactions) },
            { key: "total_revenue_kwd", label: t("revenue"), render: (row) => kwd(row.total_revenue_kwd) },
            { key: "last_transaction_at", label: t("lastTransaction"), render: (row) => dateTime(row.last_transaction_at) }
          ]}
        />
      </section>
    </section>
  );
}
