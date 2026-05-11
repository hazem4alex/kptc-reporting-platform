import { EmptyState } from "../components/DataState.jsx";
import { dateTime } from "../format.js";

export function LiveMap({ rows }) {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Location feed</p>
          <h1>Live Map</h1>
        </div>
      </div>

      <section className="map-shell">
        <div className="map-placeholder">
          <div className="map-grid" />
          <div className="map-label">Map integration placeholder</div>
        </div>
        <div className="location-list">
          {!rows?.length ? (
            <EmptyState>Location not available yet</EmptyState>
          ) : (
            rows.map((row) => (
              <article className="location-row" key={row.device_id}>
                <div>
                  <strong>{row.bus_no || row.device_id}</strong>
                  <span>{row.route_no ? `Route ${row.route_no}` : row.device_id}</span>
                </div>
                {row.lat && row.lng ? (
                  <p>
                    {row.lat}, {row.lng}
                    <small>Updated {dateTime(row.location_time || row.received_at)}</small>
                  </p>
                ) : (
                  <p>
                    Location not available yet
                    <small>Updated {dateTime(row.received_at)}</small>
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
