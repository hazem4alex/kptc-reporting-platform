export function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseRawGmtToKuwait(raw) {
  const value = String(raw || "").trim();
  if (!/^\d{14}$/.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));

  const gmtDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    Number.isNaN(gmtDate.getTime()) ||
    gmtDate.getUTCFullYear() !== year ||
    gmtDate.getUTCMonth() + 1 !== month ||
    gmtDate.getUTCDate() !== day ||
    gmtDate.getUTCHours() !== hour ||
    gmtDate.getUTCMinutes() !== minute ||
    gmtDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const date = new Date(gmtDate.getTime() + 3 * 60 * 60 * 1000);

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
