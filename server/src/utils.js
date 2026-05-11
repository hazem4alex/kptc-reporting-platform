export function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
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
