import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";

function cardList(row, t, isAdmin, onSetCardStatus, onDeleteCard) {
  if (!row.cards?.length) return "-";
  return (
    <div className="card-list">
      {row.cards.map((card) => (
        <span className="card-chip" key={card.card_no}>
          <b>{card.card_no}</b>
          <small>{card.is_active ? t("active") : t("inactive")}</small>
          {isAdmin ? (
            <>
              <button type="button" onClick={() => onSetCardStatus(card.card_no, !card.is_active)}>
                {card.is_active ? t("deactivate") : t("activate")}
              </button>
              <button type="button" onClick={() => onDeleteCard(card.card_no)}>{t("delete")}</button>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function DriversManagement({
  rows = [],
  isAdmin,
  onCreateDriver,
  onUpdateDriver,
  onSetDriverStatus,
  onDeleteDriver,
  onAssignDriverCard,
  onSetDriverCardStatus,
  onDeleteDriverCard,
  t
}) {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      [
        row.name_en,
        row.name_ar,
        row.phone_number,
        row.civil_id,
        ...(row.cards || []).map((card) => card.card_no)
      ].some((value) => String(value || "").toLowerCase().includes(normalized))
    );
  }, [query, rows]);

  async function submitDriver(event) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await onCreateDriver({
        name_en: form.get("name_en"),
        name_ar: form.get("name_ar"),
        phone_number: form.get("phone_number"),
        civil_id: form.get("civil_id")
      });
      formElement.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitCard(event) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await onAssignDriverCard(form.get("driver_id"), { card_no: form.get("card_no") });
      formElement.reset();
      setSelectedDriver("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onUpdateDriver({
        ...editing,
        name_en: form.get("name_en"),
        name_ar: form.get("name_ar"),
        phone_number: form.get("phone_number"),
        civil_id: form.get("civil_id")
      });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDriver(row) {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await onDeleteDriver(row.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteCard(cardNo) {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await onDeleteDriverCard(cardNo);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("driverOperations")}</p>
          <h1>{t("drivers")}</h1>
        </div>
      </div>
      <div className="management-layout">
        <div className="stacked-panels">
          <form className="panel user-form sticky-form" onSubmit={submitDriver}>
            <div className="panel-heading"><h2>{t("addDriver")}</h2></div>
            <label><span>{t("driverNameEn")}</span><input name="name_en" required /></label>
            <label><span>{t("driverNameAr")}</span><input name="name_ar" /></label>
            <label><span>{t("phoneNumber")}</span><input name="phone_number" /></label>
            <label><span>{t("civilId")}</span><input name="civil_id" required /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit">{t("addDriver")}</button>
          </form>

          <form className="panel user-form" onSubmit={submitCard}>
            <div className="panel-heading"><h2>{t("assignCard")}</h2></div>
            <label>
              <span>{t("driver")}</span>
              <select name="driver_id" required value={selectedDriver} onChange={(event) => setSelectedDriver(event.target.value)}>
                <option value="">{t("unassigned")}</option>
                {rows.filter((row) => row.is_active).map((row) => (
                  <option key={row.id} value={row.id}>{row.name_en} · {row.civil_id}</option>
                ))}
              </select>
            </label>
            <label><span>{t("card")}</span><input name="card_no" required /></label>
            <button className="primary-action" type="submit">{t("assignCard")}</button>
          </form>
        </div>

        <section className="panel">
          <div className="panel-heading"><h2>{t("drivers")}</h2><span>{filtered.length} {t("rows")}</span></div>
          <div className="management-filters">
            <input aria-label={t("search")} placeholder={t("driverSearchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Table rows={filtered} getKey={(row) => row.id} columns={[
            { key: "name_en", label: t("driverNameEn") },
            { key: "name_ar", label: t("driverNameAr"), render: (row) => row.name_ar || "-" },
            { key: "phone_number", label: t("phoneNumber"), render: (row) => row.phone_number || "-" },
            { key: "civil_id", label: t("civilId") },
            { key: "is_active", label: t("status"), render: (row) => <span className={row.is_active ? "status-pill active" : "status-pill inactive"}>{row.is_active ? t("active") : t("inactive")}</span> },
            { key: "cards", label: t("cards"), render: (row) => cardList(row, t, isAdmin, onSetDriverCardStatus, deleteCard) },
            { key: "actions", label: t("actions"), render: (row) => (
              <div className="inline-actions compact-actions">
                <button className="small-action" type="button" onClick={() => setEditing(row)}>{t("edit")}</button>
                {isAdmin ? (
                  <>
                    <button className="small-action muted-action" type="button" onClick={() => onSetDriverStatus(row.id, !row.is_active)}>
                      {row.is_active ? t("deactivate") : t("activate")}
                    </button>
                    <button className="small-action danger-action" type="button" onClick={() => deleteDriver(row)}>{t("delete")}</button>
                  </>
                ) : null}
              </div>
            ) }
          ]} />
        </section>
      </div>

      {editing ? (
        <div className="dialog-backdrop" onClick={() => setEditing(null)}>
          <form className="panel dialog" onSubmit={saveEdit} onClick={(event) => event.stopPropagation()}>
            <h2>{t("editDriver")}</h2>
            <label><span>{t("driverNameEn")}</span><input name="name_en" defaultValue={editing.name_en} required /></label>
            <label><span>{t("driverNameAr")}</span><input name="name_ar" defaultValue={editing.name_ar || ""} /></label>
            <label><span>{t("phoneNumber")}</span><input name="phone_number" defaultValue={editing.phone_number || ""} /></label>
            <label><span>{t("civilId")}</span><input name="civil_id" defaultValue={editing.civil_id} required /></label>
            <div className="inline-actions">
              <button className="primary-action">{t("save")}</button>
              <button className="small-action muted-action" type="button" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
