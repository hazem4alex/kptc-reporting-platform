import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ErrorState, Loading } from "./components/DataState.jsx";
import { createTranslator } from "./i18n.js";
import { CardTypes } from "./pages/CardTypes.jsx";
import { BusesManagement } from "./pages/BusesManagement.jsx";
import { Devices } from "./pages/Devices.jsx";
import { LiveMap } from "./pages/LiveMap.jsx";
import { Login } from "./pages/Login.jsx";
import { Overview } from "./pages/Overview.jsx";
import { RoutesManagement } from "./pages/RoutesManagement.jsx";
import { Transactions } from "./pages/Transactions.jsx";
import { Users } from "./pages/Users.jsx";

function Icon({ name }) {
  const props = {
    fill: "none",
    height: "22",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.6",
    viewBox: "0 0 24 24",
    width: "22"
  };
  if (name === "overview") {
    return (
      <svg {...props}>
        <rect height="8" rx="1.2" width="8" x="3"  y="3" />
        <rect height="5" rx="1.2" width="8" x="13" y="3" />
        <rect height="8" rx="1.2" width="8" x="13" y="10" />
        <rect height="5" rx="1.2" width="8" x="3"  y="13" />
      </svg>
    );
  }
  if (name === "transactions") {
    return (
      <svg {...props}>
        <path d="M7 7h12l-3-3" />
        <path d="M17 17H5l3 3" />
      </svg>
    );
  }
  if (name === "devices") {
    return (
      <svg {...props}>
        <rect height="14" rx="2" width="14" x="5" y="3" />
        <rect height="3" width="6" x="9" y="6" />
        <circle cx="9"  cy="13" r="0.6" />
        <circle cx="12" cy="13" r="0.6" />
        <circle cx="15" cy="13" r="0.6" />
        <path d="M9 21h6" />
      </svg>
    );
  }
  if (name === "routes") {
    return (
      <svg {...props}>
        <path d="M4 18c4 0 4-12 8-12s4 12 8 12" />
        <circle cx="4" cy="18" r="1.5" />
        <circle cx="12" cy="6" r="1.5" />
        <circle cx="20" cy="18" r="1.5" />
      </svg>
    );
  }
  if (name === "buses") {
    return (
      <svg {...props}>
        <rect height="11" rx="2" width="18" x="3" y="5" />
        <path d="M7 5V3h10v2" />
        <path d="M6 11h12" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="17" cy="18" r="1.5" />
      </svg>
    );
  }
  if (name === "card-types") {
    return (
      <svg {...props}>
        <rect height="14" rx="2" width="18" x="3" y="5" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </svg>
    );
  }
  if (name === "live-map") {
    return (
      <svg {...props}>
        <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg {...props}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M15 19c0-2.6 1.8-4.6 4-4.6" />
      </svg>
    );
  }
  return null;
}

const nav = [
  { id: "overview",     label: "overview"     },
  { id: "transactions", label: "transactions" },
  { id: "devices",      label: "devices"      },
  { id: "routes",       label: "routes"       },
  { id: "buses",        label: "buses"        },
  { id: "card-types",   label: "cardTypes"    },
  { id: "live-map",     label: "liveMap"      },
  { id: "users",        label: "users"        }
];

function readStored(key, fallback) {
  return localStorage.getItem(key) || fallback;
}

function LiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "Asia/Kuwait" })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "Asia/Kuwait" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return <span className="live-clock">{time} KWT</span>;
}

export default function App() {
  const [active, setActive] = useState("overview");
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("kptc_token");
    const user = localStorage.getItem("kptc_user");
    return token && user ? { token, user: JSON.parse(user) } : null;
  });
  const [collapsed, setCollapsed] = useState(() => readStored("kptc_sidebar", "open") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 991) setMobileOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [theme, setTheme] = useState(() => readStored("kptc_theme", "dark"));
  const [language, setLanguage] = useState(() => readStored("kptc_language", "en"));
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bsTheme = theme;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    localStorage.setItem("kptc_theme", theme);
    localStorage.setItem("kptc_language", language);
    localStorage.setItem("kptc_sidebar", collapsed ? "collapsed" : "open");
  }, [collapsed, language, theme]);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const [summary, daily, devices, transactions, cardTypes, locations, appUsers] = await Promise.all([
          api.summary(),
          api.daily(),
          api.devices(),
          api.latestTransactions(),
          api.cardTypes(),
          api.locations(),
          api.users(session.token)
        ]);
        const [routes, buses] = await Promise.all([
          api.routes(session.token),
          api.buses(session.token)
        ]);

        if (!cancelled) {
          setData({
            summary: summary.data,
            daily: daily.data,
            devices: devices.data,
            transactions: transactions.data,
            cardTypes: cardTypes.data,
            locations: locations.data,
            routes: routes.data,
            buses: buses.data
          });
          setUsers(appUsers.data);
          setError("");
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
  }, [session]);

  const page = useMemo(() => {
    if (!data) return null;
    if (active === "transactions") return <Transactions rows={data.transactions} t={t} />;
    if (active === "devices") return <Devices rows={data.devices} t={t} />;
    if (active === "routes") {
      return <RoutesManagement rows={data.routes} t={t} onCreateRoute={createRoute} onUpdateRoute={updateRoute} />;
    }
    if (active === "buses") {
      return (
        <BusesManagement
          rows={data.buses}
          routes={data.routes}
          t={t}
          onCreateBus={createBus}
          onUpdateBus={updateBus}
          onChangeRoute={changeBusRoute}
        />
      );
    }
    if (active === "card-types") return <CardTypes rows={data.cardTypes} t={t} />;
    if (active === "live-map") return <LiveMap rows={data.locations} t={t} />;
    if (active === "users") return <Users rows={users} t={t} onCreateUser={createUser} />;
    return <Overview data={data} t={t} />;
  }, [active, data, t, users]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.login({
        username: form.get("username"),
        password: form.get("password")
      });
      localStorage.setItem("kptc_token", result.token);
      localStorage.setItem("kptc_user", JSON.stringify(result.user));
      setSession({ token: result.token, user: result.user });
    } catch (err) {
      setLoginError(err.message);
    }
  }

  async function handleLogout() {
    if (session?.token) await api.logout(session.token).catch(() => {});
    localStorage.removeItem("kptc_token");
    localStorage.removeItem("kptc_user");
    setSession(null);
    setData(null);
    setUsers([]);
  }

  async function createUser(user) {
    const result = await api.createUser(session.token, user);
    setUsers((current) => [...current, result.data]);
  }

  async function createRoute(route) {
    const result = await api.createRoute(session.token, route);
    setData((current) => ({ ...current, routes: [...current.routes, result.data] }));
  }

  async function updateRoute(route) {
    const result = await api.updateRoute(session.token, route);
    const refreshedBuses = await api.buses(session.token);
    setData((current) => ({
      ...current,
      routes: current.routes.map((item) => (item.id === result.data.id ? result.data : item)),
      buses: refreshedBuses.data
    }));
    return result.data;
  }

  async function createBus(bus) {
    const result = await api.createBus(session.token, bus);
    const refreshed = await api.buses(session.token);
    setData((current) => ({ ...current, buses: refreshed.data.length ? refreshed.data : [...current.buses, result.data] }));
    return result.data;
  }

  async function updateBus(busId, bus) {
    const result = await api.updateBus(session.token, busId, bus);
    setData((current) => ({ ...current, buses: current.buses.map((item) => item.id === busId ? result.data : item) }));
    return result.data;
  }

  async function changeBusRoute(busId, activeRouteId) {
    const result = await api.changeBusRoute(session.token, busId, activeRouteId);
    setData((current) => ({
      ...current,
      buses: current.buses.map((item) => (item.id === result.data.id ? result.data : item))
    }));
    return result.data;
  }

  if (!session) {
    return <Login error={loginError} onLogin={handleLogin} t={t} />;
  }

  function navigate(id) {
    setActive(id);
    setMobileOpen(false);
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <img alt="KPTC logo" src="https://www.kptc.com.kw/img/logo.png" />
          </div>
          <button
            className="sidebar-collapse-btn"
            type="button"
            title={collapsed ? t("expand") : t("collapse")}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              className={active === item.id ? "active" : ""}
              key={item.id}
              title={t(item.label)}
              type="button"
              onClick={() => navigate(item.id)}
            >
              <b aria-hidden="true">
                <Icon name={item.id} />
              </b>
              <span>{t(item.label)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-feature" aria-hidden="true">
          <div />
          <strong>Kuwait fleet operations</strong>
          <span>Live fare uploads · device health · route activity</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button
            className="burger-btn"
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
          <div className="topbar-controls">
            <LiveClock />
            <span className="live-badge">Live</span>
            <select aria-label={t("language")} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
            <button className="icon-action" type="button" onClick={() => setTheme((v) => (v === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? t("light") : t("dark")}
            </button>
            <span className="user-chip">{session.user.display_name || session.user.username}</span>
            <button className="icon-action" type="button" onClick={handleLogout}>{t("logout")}</button>
          </div>
        </header>
        {error ? <ErrorState message={error} /> : null}
        {!data && !error ? <Loading /> : page}
      </main>
    </div>
  );
}
