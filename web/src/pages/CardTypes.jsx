import { Table } from "../components/Table.jsx";
import { count, kwd } from "../format.js";

export function CardTypes({ rows }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Fare media</p>
          <h1>Card Types</h1>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.card_type}
          columns={[
            { key: "card_type", label: "Card type" },
            { key: "transaction_count", label: "Transactions", render: (row) => count(row.transaction_count) },
            { key: "revenue_kwd", label: "Revenue", render: (row) => kwd(row.revenue_kwd) }
          ]}
        />
      </section>
    </section>
  );
}
