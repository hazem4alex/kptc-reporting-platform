import { Table } from "../components/Table.jsx";
import { dateTime, kwd } from "../format.js";

export function Transactions({ rows }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Fare activity</p>
          <h1>Transactions</h1>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.id}
          columns={[
            { key: "transaction_datetime_kuwait", label: "Transaction Time", render: (row) => row.transaction_datetime_kuwait || "-" },
            { key: "received_at", label: "Upload Time", render: (row) => dateTime(row.received_at) },
            { key: "device_id", label: "Device" },
            { key: "record_uid", label: "Record UID" },
            { key: "card_no", label: "Card" },
            { key: "card_type", label: "Type" },
            { key: "amount_display_kwd", label: "Amount", render: (row) => kwd(row.amount_display_kwd) },
            { key: "balance_display_kwd", label: "Balance", render: (row) => kwd(row.balance_display_kwd) }
          ]}
        />
      </section>
    </section>
  );
}
