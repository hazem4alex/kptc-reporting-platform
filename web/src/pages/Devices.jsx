import { Table } from "../components/Table.jsx";
import { count, dateTime, kwd } from "../format.js";

export function Devices({ rows }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Fleet status</p>
          <h1>Devices and Buses</h1>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.device_id}
          columns={[
            { key: "device_id", label: "Device" },
            { key: "bus_no", label: "Bus" },
            { key: "route_no", label: "Route" },
            { key: "last_seen_at", label: "Last seen", render: (row) => dateTime(row.last_seen_at) },
            { key: "total_transactions", label: "Transactions", render: (row) => count(row.total_transactions) },
            { key: "total_revenue_kwd", label: "Revenue", render: (row) => kwd(row.total_revenue_kwd) },
            { key: "last_transaction_at", label: "Last transaction", render: (row) => dateTime(row.last_transaction_at) }
          ]}
        />
      </section>
    </section>
  );
}
