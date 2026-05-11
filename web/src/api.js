const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }

  return body;
}

export const api = {
  summary: () => request("/api/reports/summary"),
  daily: () => request("/api/reports/daily"),
  devices: () => request("/api/reports/devices"),
  latestTransactions: () => request("/api/reports/transactions?limit=100&offset=0"),
  cardTypes: () => request("/api/reports/card-types"),
  locations: () => request("/api/reports/bus-locations/latest")
};
