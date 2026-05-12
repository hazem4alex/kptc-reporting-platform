import { Table } from "../components/Table.jsx";
import { count, kwd } from "../format.js";

export function CardTypes({ rows, t }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("fareMedia")}</p>
          <h1>{t("cardTypes")}</h1>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.card_type}
          columns={[
            { key: "card_type", label: t("cardType") },
            { key: "transaction_count", label: t("transactionCount"), render: (row) => count(row.transaction_count) },
            { key: "revenue_kwd", label: t("revenue"), render: (row) => kwd(row.revenue_kwd) }
          ]}
        />
      </section>
    </section>
  );
}
