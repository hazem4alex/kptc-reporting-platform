import { useState } from "react";
import { Table } from "../components/Table.jsx";
import { dateTime } from "../format.js";

export function Users({ rows = [], onCreateUser, t }) {
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onCreateUser({
        username: form.get("username"),
        password: form.get("password"),
        display_name: form.get("display_name"),
        role: form.get("role")
      });
      event.currentTarget.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page users-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("userAccess")}</p>
          <h1>{t("users")}</h1>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-4 col-xl-3">
        <form className="panel user-form" onSubmit={submit}>
          <div className="panel-heading">
            <h2>{t("createUser")}</h2>
          </div>
          <label>
            <span>{t("username")}</span>
            <input name="username" required type="text" />
          </label>
          <label>
            <span>{t("displayName")}</span>
            <input name="display_name" type="text" />
          </label>
          <label>
            <span>{t("password")}</span>
            <input minLength="8" name="password" required type="password" />
          </label>
          <label>
            <span>{t("role")}</span>
            <select defaultValue="viewer" name="role">
              <option value="viewer">{t("viewer")}</option>
              <option value="admin">{t("admin")}</option>
            </select>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-action" type="submit">{t("createUser")}</button>
        </form>
        </div>

        <div className="col-12 col-md-8 col-xl-9">
        <section className="panel">
          <div className="panel-heading">
            <h2>{t("users")}</h2>
          </div>
          <Table
            rows={rows}
            getKey={(row) => row.id}
            columns={[
              { key: "username", label: t("username") },
              { key: "display_name", label: t("displayName"), render: (row) => row.display_name || "-" },
              { key: "role", label: t("role") },
              { key: "created_at", label: t("created"), render: (row) => dateTime(row.created_at) },
              { key: "last_login_at", label: t("lastLogin"), render: (row) => dateTime(row.last_login_at) }
            ]}
          />
        </section>
        </div>
      </div>
    </section>
  );
}
