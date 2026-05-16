import { useState } from "react";
import { Table } from "../components/Table.jsx";
import { dateTime } from "../format.js";

function fils(value) {
  return `${Number(value || 0).toLocaleString("en-US")} fils`;
}

function RouteEditor({ row, onSave, t }) {
  const [draft, setDraft] = useState({
    route_code: row.route_code,
    route_name: row.route_name,
    fare_fils: row.fare_fils
  });
  const [saving, setSaving] = useState(false);

  async function save(changes = {}) {
    setSaving(true);
    try {
      await onSave({
        ...row,
        ...draft,
        ...changes,
        fare_fils: Number(changes.fare_fils ?? draft.fare_fils)
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inline-actions">
      <input
        aria-label={t("routeNo")}
        value={draft.route_code}
        onChange={(event) => setDraft((current) => ({ ...current, route_code: event.target.value }))}
      />
      <input
        aria-label={t("routeName")}
        value={draft.route_name}
        onChange={(event) => setDraft((current) => ({ ...current, route_name: event.target.value }))}
      />
      <input
        aria-label={t("fareFils")}
        min="0"
        type="number"
        value={draft.fare_fils}
        onChange={(event) => setDraft((current) => ({ ...current, fare_fils: event.target.value }))}
      />
      <button className="small-action" disabled={saving} type="button" onClick={() => save()}>
        {t("save")}
      </button>
      <button
        className="small-action muted-action"
        disabled={saving}
        type="button"
        onClick={() => save({ is_active: !row.is_active })}
      >
        {row.is_active ? t("deactivate") : t("activate")}
      </button>
    </div>
  );
}

export function RoutesManagement({ rows = [], onCreateRoute, onUpdateRoute, t }) {
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onCreateRoute({
        route_code: form.get("route_code"),
        route_name: form.get("route_name"),
        fare_fils: Number(form.get("fare_fils"))
      });
      event.currentTarget.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveRoute(route) {
    setError("");
    try {
      await onUpdateRoute(route);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("routeFareControl")}</p>
          <h1>{t("routesManagement")}</h1>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-3">
          <form className="panel user-form" onSubmit={submit}>
            <div className="panel-heading">
              <h2>{t("addRoute")}</h2>
            </div>
            <label>
              <span>{t("routeNo")}</span>
              <input name="route_code" required type="text" />
            </label>
            <label>
              <span>{t("routeName")}</span>
              <input name="route_name" required type="text" />
            </label>
            <label>
              <span>{t("fareFils")}</span>
              <input min="0" name="fare_fils" required type="number" />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit">{t("addRoute")}</button>
          </form>
        </div>

        <div className="col-12 col-lg-9">
          <section className="panel">
            <div className="panel-heading">
              <h2>{t("routes")}</h2>
            </div>
            <Table
              rows={rows}
              getKey={(row) => row.id}
              columns={[
                { key: "id", label: "ID" },
                { key: "route_code", label: t("routeNo") },
                { key: "route_name", label: t("routeName") },
                { key: "fare_fils", label: t("fare"), render: (row) => fils(row.fare_fils) },
                {
                  key: "is_active",
                  label: t("status"),
                  render: (row) => (
                    <span className={row.is_active ? "status-pill active" : "status-pill inactive"}>
                      {row.is_active ? t("active") : t("inactive")}
                    </span>
                  )
                },
                { key: "updated_at", label: t("updated"), render: (row) => dateTime(row.updated_at) },
                {
                  key: "actions",
                  label: t("actions"),
                  render: (row) => <RouteEditor row={row} onSave={saveRoute} t={t} />
                }
              ]}
            />
          </section>
        </div>
      </div>
    </section>
  );
}
