import { dateTime } from "./format.js";

export function hasScanLocation(row) {
  if (row?.scan_lat == null || row?.scan_lng == null) return false;
  const lat = Number(row.scan_lat);
  const lng = Number(row.scan_lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export function buildLatestLocationsByDevice(locations = []) {
  const map = new Map();
  for (const row of locations || []) {
    if (!row.device_id) continue;
    const current = map.get(row.device_id);
    const currentTime = new Date(current?.location_time || current?.received_at || 0).getTime();
    const rowTime = new Date(row.location_time || row.received_at || 0).getTime();
    if (!current || rowTime >= currentTime) map.set(row.device_id, row);
  }
  return map;
}

export function locationDetails(row, latestLocationsByDevice) {
  if (hasScanLocation(row)) {
    return {
      lat: Number(row.scan_lat),
      lng: Number(row.scan_lng),
      source: row.scan_location_source || "",
      accuracy: row.scan_location_accuracy || "",
      time: row.scan_location_time || row.received_at || "",
      fromScan: true
    };
  }

  const latest = latestLocationsByDevice?.get(row?.device_id);
  if (!latest || latest.lat == null || latest.lng == null) return null;

  const lat = Number(latest.lat);
  const lng = Number(latest.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    source: latest.source || "",
    accuracy: latest.accuracy || "",
    time: latest.location_time || latest.received_at || "",
    fromScan: false
  };
}

export function locationMethodKeyFromDetails(details) {
  if (!details) return "unavailable";
  const source = String(details.source || "").toLowerCase();
  const accuracy = String(details.accuracy || "").toLowerCase();
  if (accuracy.includes("approx") || source.startsWith("ip_geo") || source.includes("ipapi") || source.includes("ip-api")) return "approximate";
  if (source.includes("gps") || source.includes("lh16")) return "gps";
  return "other";
}

export function locationMethodLabelFromDetails(details, t) {
  const key = locationMethodKeyFromDetails(details);
  if (key === "gps") return t("gpsLocation");
  if (key === "approximate") return t("approximateLocation");
  if (key === "other") return details?.source || t("otherLocationMethod");
  return t("locationUnavailableShort");
}

export function scanLocationUrl(details) {
  if (!details) return "";
  return `https://www.google.com/maps?q=${details.lat},${details.lng}`;
}

export function formatLocationSummary(details, t) {
  if (!details) return t("locationUnavailableShort");
  return `${details.lat.toFixed(6)}, ${details.lng.toFixed(6)} · ${locationMethodLabelFromDetails(details, t)}`;
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(from, station) {
  const stationLat = Number(station.latitude);
  const stationLng = Number(station.longitude);
  if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return null;

  const earthKm = 6371;
  const dLat = radians(stationLat - from.lat);
  const dLng = radians(stationLng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(stationLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function stationLabel(station) {
  if (!station) return "";
  const en = station.name_en || "";
  const ar = station.name_ar || "";
  if (en && ar && en !== ar) return `${en} / ${ar}`;
  return en || ar || station.id || "";
}

export function nearestStation(details, stations = []) {
  if (!details) return null;

  let best = null;
  for (const station of stations || []) {
    if (station.is_active === false) continue;
    const km = distanceKm(details, station);
    if (km == null) continue;
    if (!best || km < best.distanceKm) {
      best = { station, distanceKm: km };
    }
  }

  return best;
}

export function formatDistance(distanceKmValue, t) {
  if (!Number.isFinite(distanceKmValue)) return "";
  if (distanceKmValue < 1) return `${Math.round(distanceKmValue * 1000)} ${t("meters")}`;
  return `${distanceKmValue.toFixed(2)} ${t("kilometers")}`;
}

export function nearestStationText(details, stations, t) {
  const nearest = nearestStation(details, stations);
  if (!nearest) return t("stationUnavailable");
  return `${stationLabel(nearest.station)} · ${formatDistance(nearest.distanceKm, t)}`;
}

export function ScanLocationCell({ details, t }) {
  if (!details) return <span className="muted-value">{t("locationUnavailableShort")}</span>;
  return (
    <div className="scan-location-cell">
      <a href={scanLocationUrl(details)} target="_blank" rel="noreferrer">
        {details.lat.toFixed(6)}, {details.lng.toFixed(6)}
      </a>
      {details.time && <small>{dateTime(details.time)} · {details.fromScan ? t("scanLocation") : t("latestDeviceLocation")}</small>}
    </div>
  );
}

export function LocationMethodCell({ details, t }) {
  const key = locationMethodKeyFromDetails(details);
  const source = details?.source || "";
  return (
    <div className="location-method-cell">
      <span className={`status-pill location-method ${key}`}>{locationMethodLabelFromDetails(details, t)}</span>
      {source && <small>{source}</small>}
    </div>
  );
}

export function NearestStationCell({ details, stations, t }) {
  const nearest = nearestStation(details, stations);
  if (!nearest) return <span className="muted-value">{t("stationUnavailable")}</span>;
  return (
    <div className="nearest-station-cell">
      <strong>{stationLabel(nearest.station)}</strong>
      <small>{formatDistance(nearest.distanceKm, t)}</small>
    </div>
  );
}
