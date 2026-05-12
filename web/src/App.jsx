import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ErrorState, Loading } from "./components/DataState.jsx";
import { createTranslator } from "./i18n.js";
import { CardTypes } from "./pages/CardTypes.jsx";
import { Devices } from "./pages/Devices.jsx";
import { LiveMap } from "./pages/LiveMap.jsx";
import { Login } from "./pages/Login.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Transactions } from "./pages/Transactions.jsx";
import { Users } from "./pages/Users.jsx";

const nav = [
  { id: "overview",     label: "overview",     icon: "◈" },
  { id: "transactions", label: "transactions",  icon: "≋" },
  { id: "devices",      label: "devices",       icon: "◉" },
  { id: "card-types",   label: "cardTypes",     icon: "▣" },
  { id: "live-map",     label: "liveMap",       icon: "⊕" },
  { id: "users",        label: "users",         icon: "◯" }
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

        if (!cancelled) {
          setData({
            summary: summary.data,
            daily: daily.data,
            devices: devices.data,
            transactions: transactions.data,
            cardTypes: cardTypes.data,
            locations: locations.data
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
              <b aria-hidden="true">{item.icon}</b>
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
