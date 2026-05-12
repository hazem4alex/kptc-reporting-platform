export function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseRawWithOffset(raw, offsetHours = -5) {
  const value = String(raw || "").trim();
  if (!/^\d{14}$/.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));

  const neutralDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    Number.isNaN(neutralDate.getTime()) ||
    neutralDate.getUTCFullYear() !== year ||
    neutralDate.getUTCMonth() + 1 !== month ||
    neutralDate.getUTCDate() !== day ||
    neutralDate.getUTCHours() !== hour ||
    neutralDate.getUTCMinutes() !== minute ||
    neutralDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const numericOffset = Number(offsetHours);
  const safeOffset = Number.isFinite(numericOffset) ? numericOffset : -5;
  const date = new Date(neutralDate.getTime() + safeOffset * 60 * 60 * 1000);

  const pad = (part) => String(part).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("-") + ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parsePositiveInt(value, fallback, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    const err = new Error(`${name} is required`);
    err.statusCode = 400;
    throw err;
  }

  return value.trim();
}

export function getMoneyScale(amountRaw) {
  const n = Number(amountRaw);
  if (n === 25) return 100;
  if (n === 250) return 1000;
  return 1000;
}

export function applyMoneyScale(row) {
  if (!row) return row;
  const amountRaw = row.amount_raw == null ? null : Number(row.amount_raw);
  const balanceRaw = row.balance_raw == null ? null : Number(row.balance_raw);
  const scale = getMoneyScale(amountRaw);
  const amount = amountRaw == null ? null : amountRaw / scale;
  const balanceBefore = balanceRaw == null ? null : balanceRaw / scale;
  const balanceAfter =
    balanceRaw == null || amountRaw == null ? null : (balanceRaw - amountRaw) / scale;
  return {
    ...row,
    money_scale: scale,
    amount_corrected: amount,
    balance_before_corrected: balanceBefore,
    balance_after_corrected: balanceAfter
  };
}
