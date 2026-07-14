import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";
import { count, dateTime, kwd } from "../format.js";
import {
  formatLocationSummary,
  locationMethodKeyFromDetails,
  locationMethodLabelFromDetails,
  nearestStation,
  nearestStationText,
  NearestStationCell,
  scanLocationUrl,
  scanLocationDetails,
  stationLabel,
  ScanLocationCell,
  LocationMethodCell
} from "../locationDisplay.jsx";

function transactionDate(row) {
  return String(row.transaction_datetime_kuwait || "").slice(0, 10);
}

function includes(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function routeKey(row) {
  return row.current_route_id || row.current_route_code || row.current_route_name || "";
}

function routeLabel(row) {
  const code = row.current_route_code || "";
  const name = row.current_route_name || "";
  if (code && name && code !== name) return `${code} - ${name}`;
  return code || name || "-";
}

function driverKey(row) {
  return row.current_driver_id || row.current_driver_card_no || "";
}

function driverLabel(row) {
  const name = row.current_driver_name_en || row.current_driver_name_ar || "";
  const card = row.current_driver_card_no || "";
  if (name && card) return `${name} · ${card}`;
  return name || card || "-";
}

function stationKey(row, stations) {
  const nearest = nearestStation(scanLocationDetails(row), stations);
  return nearest?.station?.id || "";
}

function stationGroupLabel(row, stations, t) {
  const nearest = nearestStation(scanLocationDetails(row), stations);
  return nearest?.station ? stationLabel(nearest.station) : t("stationUnavailable");
}

function compareDate(a, b, key) {
  return new Date(b[key] || 0) - new Date(a[key] || 0);
}

function groupRows(rows, groupBy, stations, t) {
  const groups = new Map();
  for (const row of rows) {
    const key =
      groupBy === "date"
        ? transactionDate(row)
        : groupBy === "nearest_station"
          ? stationGroupLabel(row, stations, t)
        : groupBy === "current_route"
          ? routeLabel(row)
          : groupBy === "current_driver"
            ? driverLabel(row)
          : row[groupBy] || "__unassigned__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([title, group]) => ({ title, rows: group }));
}

function sumAmount(rows) {
  return rows.reduce((total, row) => total + Number(row.amount_corrected || 0), 0);
}

export function Transactions({ rows = [], stations = [], onRefresh, t }) {
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    query: "",
    device: "all",
    bus: "all",
    route: "all",
    driver: "all",
    cardType: "all",
    station: "all",
    from: "",
    to: "",
    minAmount: "",
    locationMethod: "all",
    sort: "latest",
    groupBy: "none"
  });

  const sortOptions = [
    { value: "latest",      labelKey: "latestUploaded" },
    { value: "amount-desc", labelKey: "amountHighLow" },
    { value: "amount-asc",  labelKey: "amountLowHigh" },
    { value: "time-desc",   labelKey: "txTimeNewest" },
    { value: "device",      labelKey: "device" },
    { value: "bus",         labelKey: "busNumber" },
    { value: "route",       labelKey: "currentRoute" },
    { value: "driver",      labelKey: "currentDriver" }
  ];

  const groupOptions = [
    { value: "none",      labelKey: "noGrouping" },
    { value: "device_id", labelKey: "device" },
    { value: "bus_number", labelKey: "busNumber" },
    { value: "current_route", labelKey: "currentRoute" },
    { value: "current_driver", labelKey: "currentDriver" },
    { value: "nearest_station", labelKey: "nearestStation" },
    { value: "card_type", labelKey: "cardType" },
    { value: "date",      labelKey: "date" }
  ];

  const devices = useMemo(() => Array.from(new Set(rows.map((row) => row.device_id).filter(Boolean))).sort(), [rows]);
  const buses = useMemo(() => Array.from(new Set(rows.map((row) => row.bus_number).filter(Boolean))).sort(), [rows]);
  const drivers = useMemo(() => {
    const options = new Map();
    for (const row of rows) {
      const value = driverKey(row);
      if (value) options.set(value, driverLabel(row));
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const routes = useMemo(() => {
    const options = new Map();
    for (const row of rows) {
      const value = routeKey(row);
      if (value) options.set(value, routeLabel(row));
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const cardTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.card_type).filter(Boolean))).sort(), [rows]);
  const stationOptions = useMemo(() => {
    const options = new Map();
    for (const row of rows) {
      const nearest = nearestStation(scanLocationDetails(row), stations);
      if (nearest?.station?.id) options.set(nearest.station.id, stationLabel(nearest.station));
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, stations]);
  const locationMethodOptions = [
    { value: "all", labelKey: "allLocationMethods" },
    { value: "gps", labelKey: "gpsLocation" },
    { value: "approximate", labelKey: "approximateLocation" },
    { value: "other", labelKey: "otherLocationMethod" },
    { value: "unavailable", labelKey: "locationUnavailableShort" }
  ];

  const filteredRows = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const minAmount = Number(filters.minAmount || 0);

    return rows
      .filter((row) => {
        const details = scanLocationDetails(row);
        if (query && ![
          row.device_id,
          row.bus_number,
          row.current_route_code,
          row.current_route_name,
          row.current_driver_card_no,
          row.current_driver_name_en,
          row.current_driver_name_ar,
          row.current_driver_civil_id,
          details?.lat,
          details?.lng,
          details?.source,
          details?.accuracy,
          locationMethodLabelFromDetails(details, t),
          nearestStationText(details, stations, t),
          row.record_uid,
          row.card_no,
          row.card_type,
          row.transaction_datetime_raw
        ].some((value) => includes(value, query))) {
          return false;
        }
        if (filters.device !== "all" && row.device_id !== filters.device) return false;
        if (filters.bus !== "all" && row.bus_number !== filters.bus) return false;
        if (filters.route !== "all" && routeKey(row) !== filters.route) return false;
        if (filters.driver !== "all" && driverKey(row) !== filters.driver) return false;
        if (filters.cardType !== "all" && row.card_type !== filters.cardType) return false;
        if (filters.station !== "all" && stationKey(row, stations) !== filters.station) return false;
        if (filters.locationMethod !== "all" && locationMethodKeyFromDetails(details) !== filters.locationMethod) return false;
        if (filters.from && transactionDate(row) < filters.from) return false;
        if (filters.to && transactionDate(row) > filters.to) return false;
        if (filters.minAmount && Number(row.amount_display_kwd || 0) < minAmount) return false;
        return true;
      })
      .sort((a, b) => {
        if (filters.sort === "amount-desc") return Number(b.amount_corrected || 0) - Number(a.amount_corrected || 0);
        if (filters.sort === "amount-asc") return Number(a.amount_corrected || 0) - Number(b.amount_corrected || 0);
        if (filters.sort === "time-desc") return String(b.transaction_datetime_kuwait || "").localeCompare(String(a.transaction_datetime_kuwait || ""));
        if (filters.sort === "device") return String(a.device_id || "").localeCompare(String(b.device_id || ""));
        if (filters.sort === "bus") return String(a.bus_number || "").localeCompare(String(b.bus_number || ""));
        if (filters.sort === "route") return routeLabel(a).localeCompare(routeLabel(b));
        if (filters.sort === "driver") return driverLabel(a).localeCompare(driverLabel(b));
        return compareDate(a, b, "received_at") || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [filters, rows, stations, t]);

  const grouped = useMemo(() => {
    if (filters.groupBy === "none") return [{ title: t("allTransactions"), rows: filteredRows }];
    return groupRows(filteredRows, filters.groupBy, stations, t).map((g) => ({
      ...g,
      title: g.title === "__unassigned__" ? t("unassigned") : g.title
    }));
  }, [filteredRows, filters.groupBy, stations, t]);

  const totalAmount = sumAmount(filteredRows);
  const latestScanLocationDetails = useMemo(() => {
    return filteredRows
      .map((row) => scanLocationDetails(row))
      .filter(Boolean)
      .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))[0] || null;
  }, [filteredRows]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="page transactions-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("fareActivity")}</p>
          <h1>{t("transactionsGrid")}</h1>
        </div>
        <div className="page-header-actions">
          <div className="transaction-summary">
            <span>{count(filteredRows.length)} {t("rows")}</span>
            <strong>{t("amountTotal")}: {kwd(totalAmount)}</strong>
            <span>
              {t("scanLocation")}:{" "}
              {latestScanLocationDetails ? (
                <a href={scanLocationUrl(latestScanLocationDetails)} target="_blank" rel="noreferrer">
                  {formatLocationSummary(latestScanLocationDetails, t)}
                </a>
              ) : (
                t("locationUnavailableShort")
              )}
            </span>
          </div>
          <button className="small-action" disabled={refreshing} type="button" onClick={handleRefresh}>
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
        </div>
      </div>

      <section className="filter-panel" aria-label="Transaction filters">
        <label className="field wide">
          <span>{t("search")}</span>
          <input
            placeholder={t("searchPlaceholder")}
            type="search"
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("device")}</span>
          <select value={filters.device} onChange={(event) => updateFilter("device", event.target.value)}>
            <option value="all">{t("allDevices")}</option>
            {devices.map((device) => <option key={device} value={device}>{device}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("busNumber")}</span>
          <select value={filters.bus} onChange={(event) => updateFilter("bus", event.target.value)}>
            <option value="all">{t("allBuses")}</option>
            {buses.map((bus) => <option key={bus} value={bus}>{bus}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("currentRoute")}</span>
          <select value={filters.route} onChange={(event) => updateFilter("route", event.target.value)}>
            <option value="all">{t("allCurrentRoutes")}</option>
            {routes.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("currentDriver")}</span>
          <select value={filters.driver} onChange={(event) => updateFilter("driver", event.target.value)}>
            <option value="all">{t("allDrivers")}</option>
            {drivers.map((driver) => <option key={driver.value} value={driver.value}>{driver.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("cardType")}</span>
          <select value={filters.cardType} onChange={(event) => updateFilter("cardType", event.target.value)}>
            <option value="all">{t("allTypes")}</option>
            {cardTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("nearestStation")}</span>
          <select value={filters.station} onChange={(event) => updateFilter("station", event.target.value)}>
            <option value="all">{t("allStations")}</option>
            {stationOptions.map((station) => (
              <option key={station.value} value={station.value}>{station.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("locationMethod")}</span>
          <select value={filters.locationMethod} onChange={(event) => updateFilter("locationMethod", event.target.value)}>
            {locationMethodOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("from")}</span>
          <input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} />
        </label>
        <label className="field">
          <span>{t("to")}</span>
          <input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} />
        </label>
        <label className="field">
          <span>{t("minAmount")}</span>
          <input
            min="0"
            step="0.001"
            type="number"
            value={filters.minAmount}
            onChange={(event) => updateFilter("minAmount", event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("sort")}</span>
          <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("group")}</span>
          <select value={filters.groupBy} onChange={(event) => updateFilter("groupBy", event.target.value)}>
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="grouped-table-stack">
        {grouped.map((group) => (
          <section className="panel" key={group.title}>
            <div className="panel-heading">
              <h2>{group.title}</h2>
              <span>{count(group.rows.length)} {t("rows")} · {t("amountTotal")}: {kwd(sumAmount(group.rows))}</span>
            </div>
            <Table
              rows={group.rows}
              getKey={(row) => row.id}
              columns={[
                { key: "transaction_datetime_kuwait", label: t("transactionTime"), render: (row) => row.transaction_datetime_kuwait || "-" },
                { key: "received_at", label: t("uploadTime"), render: (row) => dateTime(row.received_at) },
                { key: "device_id", label: t("device") },
                { key: "bus_number", label: t("busNumber"), render: (row) => row.bus_number || "-" },
                { key: "current_route", label: t("currentRoute"), render: (row) => routeLabel(row) },
                { key: "current_driver_card_no", label: t("currentDriver"), render: driverLabel },
                { key: "scan_location", label: t("scanLocation"), render: (row) => <ScanLocationCell details={scanLocationDetails(row)} t={t} /> },
                { key: "scan_location_method", label: t("locationMethod"), render: (row) => <LocationMethodCell details={scanLocationDetails(row)} t={t} /> },
                { key: "nearest_station", label: t("nearestStation"), render: (row) => <NearestStationCell details={scanLocationDetails(row)} stations={stations} t={t} /> },
                { key: "record_uid", label: t("recordUid") },
                { key: "card_no", label: t("card") },
                { key: "card_type", label: t("type") },
                { key: "amount_corrected", label: t("amount"), render: (row) => kwd(row.amount_corrected) },
                { key: "balance_before_corrected", label: t("balanceBefore"), render: (row) => kwd(row.balance_before_corrected) },
                { key: "balance_after_corrected", label: t("balanceAfter"), render: (row) => kwd(row.balance_after_corrected) }
              ]}
            />
          </section>
        ))}
      </div>
    </section>
  );
}
