import { useState } from "react";
import { Table } from "../components/Table.jsx";

const fare = (value) => `${(Number(value || 0) / 1000).toFixed(3)} KWD`;

function RouteEditor({ row, onSave, t }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(row);

  async function save(changes = {}) {
    setSaving(true);
    try {
      await onSave({ ...row, ...draft, ...changes, fare_fils: Number(draft.fare_fils) });
      setEditing(false);
    } finally { setSaving(false); }
  }

  if (!editing) return (
    <div className="inline-actions compact-actions">
      <button className="small-action" type="button" onClick={() => { setDraft(row); setEditing(true); }}>{t("edit")}</button>
      <button className="small-action muted-action" disabled={saving} type="button"
        onClick={() => save({ is_active: !row.is_active })}>
        {row.is_active ? t("deactivate") : t("activate")}
      </button>
    </div>
  );

  return (
    <div className="inline-editor">
      <input aria-label={t("routeNo")} value={draft.route_code}
        onChange={(e) => setDraft({ ...draft, route_code: e.target.value })} />
      <input aria-label={t("routeName")} value={draft.route_name}
        onChange={(e) => setDraft({ ...draft, route_name: e.target.value })} />
      <input aria-label={t("fareFils")} min="0" step="1" type="number" value={draft.fare_fils}
        onChange={(e) => setDraft({ ...draft, fare_fils: e.target.value })} />
      <div className="inline-actions compact-actions">
        <button className="small-action" disabled={saving} type="button" onClick={() => save()}>{t("save")}</button>
        <button className="small-action muted-action" type="button" onClick={() => setEditing(false)}>{t("cancel")}</button>
      </div>
    </div>
  );
}

export function RoutesManagement({ rows = [], onCreateRoute, onUpdateRoute, t }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await onCreateRoute({ route_code: form.get("route_code"), route_name: form.get("route_name"),
        fare_fils: Number(form.get("fare_fils")), is_active: true });
      event.currentTarget.reset();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function saveRoute(route) {
    setError("");
    try { await onUpdateRoute(route); } catch (err) { setError(err.message); throw err; }
  }

  return <section className="page">
    <div className="page-header"><div><p className="eyebrow">{t("routeFareControl")}</p><h1>{t("routesManagement")}</h1></div></div>
    <div className="management-layout">
      <form className="panel user-form sticky-form" onSubmit={submit}>
        <div className="panel-heading"><h2>{t("addRoute")}</h2></div>
        <label><span>{t("routeNo")}</span><input name="route_code" required /></label>
        <label><span>{t("routeName")}</span><input name="route_name" required /></label>
        <label><span>{t("fareFils")}</span><input min="0" step="1" name="fare_fils" required type="number" /></label>
        <p className="field-hint">250 fils = 0.250 KWD</p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={saving} type="submit">{t("addRoute")}</button>
      </form>
      <section className="panel"><div className="panel-heading"><h2>{t("routes")}</h2><span>{rows.length} {t("rows")}</span></div>
        <Table rows={rows} getKey={(row) => row.id} columns={[
          { key: "route_code", label: t("routeNo") },
          { key: "route_name", label: t("routeName") },
          { key: "fare_fils", label: t("fare"), render: (row) => <span className="fare-stack"><strong>{fare(row.fare_fils)}</strong><small>{row.fare_fils} fils</small></span> },
          { key: "is_active", label: t("active"), render: (row) => <span className={row.is_active ? "status-pill active" : "status-pill inactive"}>{row.is_active ? t("active") : t("inactive")}</span> },
          { key: "assigned_buses_count", label: t("assignedBuses"), render: (row) => row.assigned_buses_count || 0 },
          { key: "actions", label: t("actions"), render: (row) => <RouteEditor row={row} onSave={saveRoute} t={t} /> }
        ]} />
      </section>
    </div>
  </section>;
}
