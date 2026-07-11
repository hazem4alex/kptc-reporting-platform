import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";
import { dateTime } from "../format.js";

const routeLabel = (r) => `${r.route_code} · ${r.route_name}`;
const fare = (value) => value == null ? "—" : `${(Number(value) / 1000).toFixed(3)} KWD`;

export function BusesManagement({ rows = [], routes = [], onCreateBus, onUpdateBus, onChangeRoute, t }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [editing, setEditing] = useState(null);
  const [details, setDetails] = useState(null);

  const selected = routes.find((r) => r.id === selectedRoute);
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesText = !query || `${row.device_id} ${row.bus_number || row.bus_code}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (!routeFilter || row.active_route_id === routeFilter);
  }), [query, routeFilter, rows]);

  async function submit(event) {
    event.preventDefault(); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await onCreateBus({ device_id: form.get("device_id"), bus_number: form.get("bus_number"), active_route_id: form.get("active_route_id") || null });
      setNotice(`${t("configurationSaved")} ${result.route_config_version}`); event.currentTarget.reset(); setSelectedRoute("");
    } catch (err) { setError(err.message); }
  }

  async function assign(row, routeId) {
    setError(""); setNotice("");
    try { const result = await onChangeRoute(row.id, routeId); setNotice(`${t("configurationSaved")} ${result.route_config_version}`); }
    catch (err) { setError(err.message); }
  }

  async function saveEdit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const result = await onUpdateBus(editing.id, { device_id: form.get("device_id"), bus_number: form.get("bus_number") }); setEditing(null); setNotice(`${t("configurationSaved")} ${result.route_config_version}`); }
    catch (err) { setError(err.message); }
  }

  const jsonFor = (row) => ({ success: true, device_id: row.device_id, bus_id: row.id,
    bus_number: row.bus_number || row.bus_code, version: row.route_config_version,
    route_id: row.active_route_id, route_code: row.active_route_code || row.route_code,
    route_name: row.active_route_name || row.route_name, fare_fils: row.fare_fils,
    fare_kwd: row.fare_kwd, updated_at: row.updated_at });

  return <section className="page">
    <div className="page-header"><div><p className="eyebrow">{t("deviceRouteConfig")}</p><h1>{t("busesManagement")}</h1></div></div>
    <div className="management-layout">
      <form className="panel user-form sticky-form" onSubmit={submit}>
        <div className="panel-heading"><h2>{t("registerDevice")}</h2></div>
        <label><span>{t("deviceId")}</span><input name="device_id" required /></label>
        <label><span>{t("busNumber")}</span><input name="bus_number" required /></label>
        <label><span>{t("activeRoute")}</span><select name="active_route_id" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
          <option value="">{t("unassigned")}</option>{routes.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{routeLabel(r)}</option>)}</select></label>
        {selected && <div className="fare-preview"><span>{t("routeFare")}</span><strong>{selected.fare_fils} fils</strong><b>{selected.fare_kwd || (selected.fare_fils / 1000).toFixed(3)} KWD</b></div>}
        {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
        <button className="primary-action" type="submit">{t("saveAssignment")}</button>
      </form>
      <section className="panel"><div className="panel-heading"><h2>{t("busesManagement")}</h2><span>{filtered.length} {t("rows")}</span></div>
        <div className="management-filters"><input aria-label={t("search")} placeholder={t("searchDeviceBus")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}><option value="">{t("allRoutes")}</option>{routes.map((r) => <option key={r.id} value={r.id}>{routeLabel(r)}</option>)}</select></div>
        <Table rows={filtered} getKey={(r) => r.id} columns={[
          { key: "device_id", label: t("deviceId") }, { key: "bus_number", label: t("busNumber"), render: (r) => r.bus_number || r.bus_code },
          { key: "route_name", label: t("activeRoute"), render: (r) => r.active_route_name || r.route_name || "—" },
          { key: "fare_kwd", label: t("fare"), render: (r) => <span className="fare-stack"><strong>{fare(r.fare_fils)}</strong>{r.fare_fils != null && <small>{r.fare_fils} fils</small>}</span> },
          { key: "route_config_version", label: t("configVersion") }, { key: "updated_at", label: t("updated"), render: (r) => dateTime(r.updated_at) },
          { key: "actions", label: t("actions"), render: (r) => <div className="bus-actions"><select aria-label={t("assignActiveRoute")} value={r.active_route_id || ""} onChange={(e) => e.target.value && assign(r, e.target.value)}><option disabled value="">{t("unassigned")}</option>{routes.filter((x) => x.is_active || x.id === r.active_route_id).map((x) => <option key={x.id} value={x.id}>{routeLabel(x)}</option>)}</select><div className="inline-actions compact-actions"><button className="small-action" onClick={() => setEditing(r)} type="button">{t("edit")}</button><button className="small-action muted-action" onClick={() => setDetails(jsonFor(r))} type="button">JSON</button></div></div> }
        ]} />
      </section>
    </div>
    {editing && <div className="dialog-backdrop" onClick={() => setEditing(null)}><form className="panel dialog" onSubmit={saveEdit} onClick={(e) => e.stopPropagation()}><h2>{t("editDevice")}</h2><label><span>{t("deviceId")}</span><input name="device_id" defaultValue={editing.device_id} required /></label><label><span>{t("busNumber")}</span><input name="bus_number" defaultValue={editing.bus_number || editing.bus_code} required /></label><div className="inline-actions"><button className="primary-action">{t("save")}</button><button className="small-action muted-action" type="button" onClick={() => setEditing(null)}>{t("cancel")}</button></div></form></div>}
    {details && <div className="dialog-backdrop" onClick={() => setDetails(null)}><section className="panel dialog json-dialog" onClick={(e) => e.stopPropagation()}><div className="panel-heading"><h2>{t("deviceConfiguration")}</h2><button className="small-action" onClick={() => setDetails(null)} type="button">{t("close")}</button></div><pre>{JSON.stringify(details, null, 2)}</pre></section></div>}
  </section>;
}
