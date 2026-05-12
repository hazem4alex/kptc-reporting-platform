import { useMemo, useState } from "react";
import { Table } from "../components/Table.jsx";
import { count, dateTime, kwd } from "../format.js";

function transactionDate(row) {
  return String(row.transaction_datetime_kuwait || "").slice(0, 10);
}

function includes(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function compareDate(a, b, key) {
  return new Date(b[key] || 0) - new Date(a[key] || 0);
}

function groupRows(rows, groupBy) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupBy === "date" ? transactionDate(row) : row[groupBy] || "__unassigned__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([title, group]) => ({ title, rows: group }));
}

export function Transactions({ rows = [], t }) {
  const [filters, setFilters] = useState({
    query: "",
    device: "all",
    cardType: "all",
    from: "",
    to: "",
    minAmount: "",
    sort: "latest",
    groupBy: "none"
  });

  const sortOptions = [
    { value: "latest",      labelKey: "latestUploaded" },
    { value: "amount-desc", labelKey: "amountHighLow" },
    { value: "amount-asc",  labelKey: "amountLowHigh" },
    { value: "time-desc",   labelKey: "txTimeNewest" },
    { value: "device",      labelKey: "device" }
  ];

  const groupOptions = [
    { value: "none",      labelKey: "noGrouping" },
    { value: "device_id", labelKey: "device" },
    { value: "card_type", labelKey: "cardType" },
    { value: "date",      labelKey: "date" }
  ];

  const devices = useMemo(() => Array.from(new Set(rows.map((row) => row.device_id).filter(Boolean))).sort(), [rows]);
  const cardTypes = useMemo(() => Array.from(new Set(rows.map((row) => row.card_type).filter(Boolean))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const minAmount = Number(filters.minAmount || 0);

    return rows
      .filter((row) => {
        if (query && ![
          row.device_id,
          row.record_uid,
          row.card_no,
          row.card_type,
          row.transaction_datetime_raw
        ].some((value) => includes(value, query))) {
          return false;
        }
        if (filters.device !== "all" && row.device_id !== filters.device) return false;
        if (filters.cardType !== "all" && row.card_type !== filters.cardType) return false;
        if (filters.from && transactionDate(row) < filters.from) return false;
        if (filters.to && transactionDate(row) > filters.to) return false;
        if (filters.minAmount && Number(row.amount_display_kwd || 0) < minAmount) return false;
        return true;
      })
      .sort((a, b) => {
        if (filters.sort === "amount-desc") return Number(b.amount_display_kwd || 0) - Number(a.amount_display_kwd || 0);
        if (filters.sort === "amount-asc") return Number(a.amount_display_kwd || 0) - Number(b.amount_display_kwd || 0);
        if (filters.sort === "time-desc") return String(b.transaction_datetime_kuwait || "").localeCompare(String(a.transaction_datetime_kuwait || ""));
        if (filters.sort === "device") return String(a.device_id || "").localeCompare(String(b.device_id || ""));
        return compareDate(a, b, "received_at") || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [filters, rows]);

  const grouped = useMemo(() => {
    if (filters.groupBy === "none") return [{ title: t("allTransactions"), rows: filteredRows }];
    return groupRows(filteredRows, filters.groupBy).map((g) => ({
      ...g,
      title: g.title === "__unassigned__" ? t("unassigned") : g.title
    }));
  }, [filteredRows, filters.groupBy, t]);

  const totalAmount = filteredRows.reduce((total, row) => total + Number(row.amount_display_kwd || 0), 0);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="page transactions-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("fareActivity")}</p>
          <h1>{t("transactionsGrid")}</h1>
        </div>
        <div className="transaction-summary">
          <span>{count(filteredRows.length)} {t("rows")}</span>
          <strong>{kwd(totalAmount)}</strong>
        </div>
      </div>

      <section className="filter-panel" aria-label="Transaction filters">
        <label className="field wide">
          <span>{t("search")}</span>
          <input
            placeholder={t("searchPlaceholder")}
            type="search"
            value={filters.query}
            onChange={(event) => updateFilter("query", event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("device")}</span>
          <select value={filters.device} onChange={(event) => updateFilter("device", event.target.value)}>
            <option value="all">{t("allDevices")}</option>
            {devices.map((device) => <option key={device} value={device}>{device}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("cardType")}</span>
          <select value={filters.cardType} onChange={(event) => updateFilter("cardType", event.target.value)}>
            <option value="all">{t("allTypes")}</option>
            {cardTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("from")}</span>
          <input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} />
        </label>
        <label className="field">
          <span>{t("to")}</span>
          <input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} />
        </label>
        <label className="field">
          <span>{t("minAmount")}</span>
          <input
            min="0"
            step="0.001"
            type="number"
            value={filters.minAmount}
            onChange={(event) => updateFilter("minAmount", event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("sort")}</span>
          <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("group")}</span>
          <select value={filters.groupBy} onChange={(event) => updateFilter("groupBy", event.target.value)}>
            {groupOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="grouped-table-stack">
        {grouped.map((group) => (
          <section className="panel" key={group.title}>
            <div className="panel-heading">
              <h2>{group.title}</h2>
              <span>{count(group.rows.length)} {t("rows")}</span>
            </div>
            <Table
              rows={group.rows}
              getKey={(row) => row.id}
              columns={[
                { key: "transaction_datetime_kuwait", label: t("transactionTime"), render: (row) => row.transaction_datetime_kuwait || "-" },
                { key: "received_at", label: t("uploadTime"), render: (row) => dateTime(row.received_at) },
                { key: "device_id", label: t("device") },
                { key: "record_uid", label: t("recordUid") },
                { key: "card_no", label: t("card") },
                { key: "card_type", label: t("type") },
                { key: "amount_corrected", label: t("amount"), render: (row) => kwd(row.amount_corrected) },
                { key: "balance_before_corrected", label: t("balanceBefore"), render: (row) => kwd(row.balance_before_corrected) },
                { key: "balance_after_corrected", label: t("balanceAfter"), render: (row) => kwd(row.balance_after_corrected) }
              ]}
            />
          </section>
        ))}
      </div>
    </section>
  );
}
