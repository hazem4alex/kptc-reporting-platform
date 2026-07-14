import { useMemo, useState } from "react";
import { EmptyState } from "../components/DataState.jsx";
import { dateTime } from "../format.js";

const KUWAIT_BOUNDS = {
  minLat: 28.45,
  maxLat: 30.15,
  minLng: 46.35,
  maxLng: 48.75
};

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function busLabel(row) {
  return row.bus_no || row.bus_number || row.device_id || "-";
}

function routeLabel(row, t) {
  const routeNo = row.route_no || "";
  const routeName = row.route_name || "";
  if (routeNo && routeName && routeNo !== routeName) return `${t("route")} ${routeNo} · ${routeName}`;
  if (routeNo || routeName) return `${t("route")} ${routeNo || routeName}`;
  return row.device_id || "-";
}

function locationTime(row) {
  return row.location_time || row.received_at || "";
}

function mapUrl(bounds) {
  const bbox = [
    bounds.minLng.toFixed(6),
    bounds.minLat.toFixed(6),
    bounds.maxLng.toFixed(6),
    bounds.maxLat.toFixed(6)
  ].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}

function markerPosition(marker, bounds) {
  const lngSpan = bounds.maxLng - bounds.minLng || 1;
  const latSpan = bounds.maxLat - bounds.minLat || 1;
  const left = ((marker.lng - bounds.minLng) / lngSpan) * 100;
  const top = (1 - (marker.lat - bounds.minLat) / latSpan) * 100;

  return {
    left: `${Math.min(96, Math.max(4, left))}%`,
    top: `${Math.min(94, Math.max(6, top))}%`
  };
}

function calculateBounds(markers) {
  if (!markers.length) return KUWAIT_BOUNDS;

  const lats = markers.map((marker) => marker.lat);
  const lngs = markers.map((marker) => marker.lng);
  const minLatRaw = Math.min(...lats);
  const maxLatRaw = Math.max(...lats);
  const minLngRaw = Math.min(...lngs);
  const maxLngRaw = Math.max(...lngs);
  const latPad = Math.max((maxLatRaw - minLatRaw) * 0.18, 0.03);
  const lngPad = Math.max((maxLngRaw - minLngRaw) * 0.18, 0.03);

  return {
    minLat: minLatRaw - latPad,
    maxLat: maxLatRaw + latPad,
    minLng: minLngRaw - lngPad,
    maxLng: maxLngRaw + lngPad
  };
}

export function LiveMap({ rows = [], onRefresh, t }) {
  const [refreshing, setRefreshing] = useState(false);
  const [busFilter, setBusFilter] = useState("all");

  const busOptions = useMemo(() => {
    const options = new Map();
    for (const row of rows) {
      const label = busLabel(row);
      if (label && label !== "-") options.set(label, label);
    }
    return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (busFilter === "all") return rows;
    return rows.filter((row) => busLabel(row) === busFilter);
  }, [busFilter, rows]);

  const markers = useMemo(() => {
    return filteredRows
      .map((row) => {
        const lat = numberOrNull(row.lat);
        const lng = numberOrNull(row.lng);
        if (lat == null || lng == null) return null;
        return { ...row, lat, lng };
      })
      .filter(Boolean);
  }, [filteredRows]);

  const bounds = useMemo(() => calculateBounds(markers), [markers]);
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => new Date(locationTime(b) || 0) - new Date(locationTime(a) || 0));
  }, [filteredRows]);

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
    <section className="page live-map-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("locationFeed")}</p>
          <h1>{t("liveMapTitle")}</h1>
        </div>
        <div className="page-header-actions">
          <label className="field compact-field">
            <span>{t("busNumber")}</span>
            <select value={busFilter} onChange={(event) => setBusFilter(event.target.value)}>
              <option value="all">{t("allBuses")}</option>
              {busOptions.map((bus) => (
                <option key={bus} value={bus}>{bus}</option>
              ))}
            </select>
          </label>
          <div className="transaction-summary">
            <span>{markers.length} {t("busesOnMap")}</span>
            <strong>{t("updated")}: {dateTime(sortedRows[0] ? locationTime(sortedRows[0]) : "")}</strong>
          </div>
          <button className="small-action" disabled={refreshing} type="button" onClick={handleRefresh}>
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
        </div>
      </div>

      <div className="live-map-layout">
        <div className="map-placeholder">
          <iframe
            className="map-iframe"
            src={mapUrl(bounds)}
            title={t("liveMapTitle")}
          />
          <div className="map-marker-layer" aria-label={t("liveMapTitle")}>
            {markers.map((marker) => (
              <a
                className="bus-map-marker"
                href={`https://www.google.com/maps?q=${marker.lat},${marker.lng}`}
                key={`${marker.device_id}-${marker.bus_no || marker.bus_number || ""}`}
                rel="noreferrer"
                style={markerPosition(marker, bounds)}
                target="_blank"
                title={`${busLabel(marker)} · ${routeLabel(marker, t)} · ${dateTime(locationTime(marker))}`}
              >
                {busLabel(marker)}
              </a>
            ))}
          </div>
          {!markers.length && (
            <div className="map-empty-overlay">
              <EmptyState>{t("locationUnavailable")}</EmptyState>
            </div>
          )}
          <div className="map-label">{t("latestDeviceLocation")}</div>
        </div>

        <div className="location-list">
          {!sortedRows.length ? (
            <EmptyState>{t("locationUnavailable")}</EmptyState>
          ) : (
            sortedRows.map((row) => {
              const lat = numberOrNull(row.lat);
              const lng = numberOrNull(row.lng);
              return (
                <article className="location-row" key={row.device_id}>
                  <div>
                    <strong>{busLabel(row)}</strong>
                    <span>{routeLabel(row, t)}</span>
                  </div>
                  {lat != null && lng != null ? (
                    <p>
                      {lat.toFixed(6)}, {lng.toFixed(6)}
                      <small>{row.source || t("locationMethod")} · {t("updated")} {dateTime(locationTime(row))}</small>
                    </p>
                  ) : (
                    <p>
                      {t("locationUnavailable")}
                      <small>{t("updated")} {dateTime(row.received_at)}</small>
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
