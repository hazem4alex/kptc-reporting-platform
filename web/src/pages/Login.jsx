export function Login({ error, onLogin, t }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <img alt="KPTC logo" src="https://www.kptc.com.kw/img/logo.png" />
          <div>
            <p className="eyebrow">{t("reportingPlatform")}</p>
            <h1>{t("signIn")}</h1>
          </div>
        </div>
        <form className="login-form" onSubmit={onLogin}>
          <label>
            <span>{t("username")}</span>
            <input autoComplete="username" name="username" required type="text" />
          </label>
          <label>
            <span>{t("password")}</span>
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-action" type="submit">{t("signIn")}</button>
        </form>
      </section>
    </main>
  );
}
