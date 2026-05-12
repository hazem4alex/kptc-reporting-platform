import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ErrorState, Loading } from "./components/DataState.jsx";
import { CardTypes } from "./pages/CardTypes.jsx";
import { Devices } from "./pages/Devices.jsx";
import { LiveMap } from "./pages/LiveMap.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Transactions } from "./pages/Transactions.jsx";

const nav = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "devices", label: "Devices/Buses" },
  { id: "card-types", label: "Card Types" },
  { id: "live-map", label: "Live Map" }
];

export default function App() {
  const [active, setActive] = useState("overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summary, daily, devices, transactions, cardTypes, locations] = await Promise.all([
          api.summary(),
          api.daily(),
          api.devices(),
          api.latestTransactions(),
          api.cardTypes(),
          api.locations()
        ]);

        if (!cancelled) {
          setData({
            summary: summary.data,
            daily: daily.data,
            devices: devices.data,
            transactions: transactions.data,
            cardTypes: cardTypes.data,
            locations: locations.data
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    const timer = setInterval(load, 30000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const page = useMemo(() => {
    if (!data) return null;
    if (active === "transactions") return <Transactions rows={data.transactions} />;
    if (active === "devices") return <Devices rows={data.devices} />;
    if (active === "card-types") return <CardTypes rows={data.cardTypes} />;
    if (active === "live-map") return <LiveMap rows={data.locations} />;
    return <Overview data={data} />;
  }, [active, data]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img alt="KPTC logo" src="https://www.kptc.com.kw/img/logo.png" />
          <div>
            <strong>KPTC</strong>
            <span>Reporting Platform</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              className={active === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main>
        {error ? <ErrorState message={error} /> : null}
        {!data && !error ? <Loading /> : page}
      </main>
    </div>
  );
}
