import { useState } from "react";
import { Table } from "../components/Table.jsx";
import { count, kwd } from "../format.js";

export function CardTypes({ rows, t, onUpdateCardType }) {
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  async function toggleDriverCard(row) {
    setSaving(row.card_type);
    setError("");
    try {
      await onUpdateCardType(row.card_type, !row.is_driver_card);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("fareMedia")}</p>
          <h1>{t("cardTypes")}</h1>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="panel">
        <Table
          rows={rows}
          getKey={(row) => row.card_type}
          columns={[
            { key: "card_type", label: t("cardType") },
            {
              key: "is_driver_card",
              label: t("cardPurpose"),
              render: (row) => (
                <span className={`status-pill ${row.is_driver_card ? "active" : "inactive"}`}>
                  {t(row.is_driver_card ? "driverCard" : "fareCard")}
                </span>
              )
            },
            { key: "transaction_count", label: t("transactionCount"), render: (row) => count(row.transaction_count) },
            { key: "driver_event_count", label: t("driverEvents"), render: (row) => count(row.driver_event_count) },
            { key: "revenue_kwd", label: t("revenue"), render: (row) => kwd(row.revenue_kwd) },
            {
              key: "actions",
              label: t("actions"),
              render: (row) => (
                <button
                  className="small-action"
                  disabled={saving === row.card_type}
                  type="button"
                  onClick={() => toggleDriverCard(row)}
                >
                  {t(row.is_driver_card ? "markAsFareCard" : "markAsDriverCard")}
                </button>
              )
            }
          ]}
        />
      </section>
    </section>
  );
}
