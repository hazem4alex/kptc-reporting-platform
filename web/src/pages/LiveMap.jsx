import { EmptyState } from "../components/DataState.jsx";
import { dateTime } from "../format.js";

export function LiveMap({ rows, t }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("locationFeed")}</p>
          <h1>{t("liveMapTitle")}</h1>
        </div>
      </div>

      <section className="map-shell">
        <div className="map-placeholder">
          <div className="map-grid" />
          <div className="map-label">{t("mapPlaceholder")}</div>
        </div>
        <div className="location-list">
          {!rows?.length ? (
            <EmptyState>{t("locationUnavailable")}</EmptyState>
          ) : (
            rows.map((row) => (
              <article className="location-row" key={row.device_id}>
                <div>
                  <strong>{row.bus_no || row.device_id}</strong>
                  <span>{row.route_no ? `${t("route")} ${row.route_no}` : row.device_id}</span>
                </div>
                {row.lat && row.lng ? (
                  <p>
                    {row.lat}, {row.lng}
                    <small>{t("updated")} {dateTime(row.location_time || row.received_at)}</small>
                  </p>
                ) : (
                  <p>
                    {t("locationUnavailable")}
                    <small>{t("updated")} {dateTime(row.received_at)}</small>
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
