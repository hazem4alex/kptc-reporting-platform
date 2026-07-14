import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";

function location(row) {
  if (row.latitude == null || row.longitude == null) return "-";
  return `${row.latitude}, ${row.longitude}`;
}

export function StationsManagement({
  rows = [],
  isAdmin,
  onCreateStation,
  onUpdateStation,
  onSetStationStatus,
  onDeleteStation,
  t
}) {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      [row.name_en, row.name_ar, row.latitude, row.longitude]
        .some((value) => String(value || "").toLowerCase().includes(normalized))
    );
  }, [query, rows]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await onCreateStation({
        name_en: form.get("name_en"),
        name_ar: form.get("name_ar"),
        latitude: form.get("latitude"),
        longitude: form.get("longitude")
      });
      formElement.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onUpdateStation({
        ...editing,
        name_en: form.get("name_en"),
        name_ar: form.get("name_ar"),
        latitude: form.get("latitude"),
        longitude: form.get("longitude")
      });
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteStation(row) {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await onDeleteStation(row.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("routeFareControl")}</p>
          <h1>{t("stations")}</h1>
        </div>
      </div>
      <div className="management-layout">
        <form className="panel user-form sticky-form" onSubmit={submit}>
          <div className="panel-heading"><h2>{t("addStation")}</h2></div>
          <label><span>{t("stationNameEn")}</span><input name="name_en" required /></label>
          <label><span>{t("stationNameAr")}</span><input name="name_ar" /></label>
          <label><span>{t("latitude")}</span><input name="latitude" step="0.0000001" type="number" /></label>
          <label><span>{t("longitude")}</span><input name="longitude" step="0.0000001" type="number" /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-action" type="submit">{t("addStation")}</button>
        </form>

        <section className="panel">
          <div className="panel-heading"><h2>{t("stations")}</h2><span>{filtered.length} {t("rows")}</span></div>
          <div className="management-filters">
            <input aria-label={t("search")} placeholder={t("searchStations")} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Table rows={filtered} getKey={(row) => row.id} columns={[
            { key: "name_en", label: t("stationNameEn") },
            { key: "name_ar", label: t("stationNameAr"), render: (row) => row.name_ar || "-" },
            { key: "location", label: t("location"), render: location },
            { key: "is_active", label: t("status"), render: (row) => <span className={row.is_active ? "status-pill active" : "status-pill inactive"}>{row.is_active ? t("active") : t("inactive")}</span> },
            { key: "actions", label: t("actions"), render: (row) => (
              <div className="inline-actions compact-actions">
                <button className="small-action" type="button" onClick={() => setEditing(row)}>{t("edit")}</button>
                {isAdmin ? (
                  <>
                    <button className="small-action muted-action" type="button" onClick={() => onSetStationStatus(row.id, !row.is_active)}>
                      {row.is_active ? t("deactivate") : t("activate")}
                    </button>
                    <button className="small-action danger-action" type="button" onClick={() => deleteStation(row)}>{t("delete")}</button>
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
            <h2>{t("editStation")}</h2>
            <label><span>{t("stationNameEn")}</span><input name="name_en" defaultValue={editing.name_en} required /></label>
            <label><span>{t("stationNameAr")}</span><input name="name_ar" defaultValue={editing.name_ar || ""} /></label>
            <label><span>{t("latitude")}</span><input name="latitude" defaultValue={editing.latitude || ""} step="0.0000001" type="number" /></label>
            <label><span>{t("longitude")}</span><input name="longitude" defaultValue={editing.longitude || ""} step="0.0000001" type="number" /></label>
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
