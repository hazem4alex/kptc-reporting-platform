import { useState } from "react";
import { Table } from "../components/Table.jsx";
import { dateTime } from "../format.js";

function routeLabel(route) {
  return `${route.route_code} · ${route.route_name} · ${route.fare_fils} fils`;
}

function RouteSelect({ row, routes, onChangeRoute, t }) {
  const [value, setValue] = useState(row.active_route_id || "");
  const [saving, setSaving] = useState(false);

  async function change(event) {
    const nextValue = event.target.value;
    setValue(nextValue);
    if (!nextValue || nextValue === row.active_route_id) return;

    setSaving(true);
    try {
      await onChangeRoute(row.id, nextValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select aria-label={t("assignActiveRoute")} disabled={saving} value={value} onChange={change}>
      <option value="">{t("unassigned")}</option>
      {routes
        .filter((route) => route.is_active || route.id === row.active_route_id)
        .map((route) => (
          <option key={route.id} value={route.id}>
            {routeLabel(route)}
          </option>
        ))}
    </select>
  );
}

export function BusesManagement({ rows = [], routes = [], onCreateBus, onChangeRoute, t }) {
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onCreateBus({
        bus_code: form.get("bus_code"),
        plate_number: form.get("plate_number"),
        device_id: form.get("device_id"),
        active_route_id: form.get("active_route_id") || null
      });
      event.currentTarget.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeRoute(busId, activeRouteId) {
    setError("");
    try {
      await onChangeRoute(busId, activeRouteId);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("deviceRouteConfig")}</p>
          <h1>{t("busesManagement")}</h1>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-3">
          <form className="panel user-form" onSubmit={submit}>
            <div className="panel-heading">
              <h2>{t("addBus")}</h2>
            </div>
            <label>
              <span>{t("bus")}</span>
              <input name="bus_code" required type="text" />
            </label>
            <label>
              <span>{t("plateNumber")}</span>
              <input name="plate_number" type="text" />
            </label>
            <label>
              <span>{t("device")}</span>
              <input name="device_id" required type="text" />
            </label>
            <label>
              <span>{t("activeRoute")}</span>
              <select name="active_route_id" defaultValue="">
                <option value="">{t("unassigned")}</option>
                {routes.filter((route) => route.is_active).map((route) => (
                  <option key={route.id} value={route.id}>{routeLabel(route)}</option>
                ))}
              </select>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit">{t("addBus")}</button>
          </form>
        </div>

        <div className="col-12 col-lg-9">
          <section className="panel">
            <div className="panel-heading">
              <h2>{t("assignActiveRoute")}</h2>
            </div>
            <Table
              rows={rows}
              getKey={(row) => row.id}
              columns={[
                { key: "bus_code", label: t("bus") },
                { key: "plate_number", label: t("plateNumber"), render: (row) => row.plate_number || "-" },
                { key: "device_id", label: t("device") },
                { key: "route_name", label: t("activeRoute"), render: (row) => row.route_name || "-" },
                { key: "fare_fils", label: t("activeFare"), render: (row) => row.fare_fils === null ? "-" : `${row.fare_fils} fils` },
                { key: "route_config_version", label: t("configVersion") },
                {
                  key: "change_route",
                  label: t("assignActiveRoute"),
                  render: (row) => <RouteSelect row={row} routes={routes} onChangeRoute={changeRoute} t={t} />
                },
                { key: "updated_at", label: t("updated"), render: (row) => dateTime(row.updated_at) }
              ]}
            />
          </section>
        </div>
      </div>
    </section>
  );
}
