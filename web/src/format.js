export function kwd(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })} KWD`;
}

export function count(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function dateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function day(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString();
}
