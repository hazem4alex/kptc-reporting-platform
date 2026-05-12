export function Login({ error, onLogin, t }) {
  return (
    <main className="login-shell">
      <aside className="login-hero" aria-hidden="true">
        <div className="login-hero-overlay" />
        <div className="login-hero-grid" />
        <div className="login-hero-content">
          <span className="login-hero-tag">
            <i /> Kuwait Public Transport Co.
          </span>
          <div className="login-hero-headline">
            <h2>Fleet Revenue Intelligence</h2>
            <p>Live fare uploads, device health, and route activity in a single control view.</p>
          </div>
          <div className="login-hero-meta">
            <div>
              <strong>24/7</strong>
              <span>operations</span>
            </div>
            <div>
              <strong>K-BUS</strong>
              <span>fleet network</span>
            </div>
            <div>
              <strong>KWT</strong>
              <span>nationwide</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="login-card">
        <div className="login-card-inner">
          <header className="login-brand">
            <img alt="KPTC logo" src="https://www.kptc.com.kw/img/logo.png" />
            <div>
              <p className="eyebrow">{t("reportingPlatform")}</p>
              <h1>{t("signIn")}</h1>
            </div>
          </header>

          <form className="login-form" onSubmit={onLogin}>
            <label>
              <span>{t("username")}</span>
              <input autoComplete="username" name="username" required type="text" placeholder="operator" />
            </label>
            <label>
              <span>{t("password")}</span>
              <input autoComplete="current-password" name="password" required type="password" placeholder="••••••••" />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit">{t("signIn")}</button>
          </form>

          <footer className="login-foot">
            <span className="live-dot" /> Secure session · Kuwait time zone
          </footer>
        </div>
      </section>
    </main>
  );
}
