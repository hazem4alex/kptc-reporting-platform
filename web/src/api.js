const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }

  return body;
}

export const api = {
  login: (credentials) => request("/api/auth/login", { method: "POST", body: credentials }),
  logout: (token) => request("/api/auth/logout", { method: "POST", token }),
  me: (token) => request("/api/auth/me", { token }),
  users: (token) => request("/api/users", { token }),
  createUser: (token, user) => request("/api/users", { method: "POST", token, body: user }),
  routes: (token) => request("/api/routes", { token }),
  createRoute: (token, route) => request("/api/routes", { method: "POST", token, body: route }),
  updateRoute: (token, route) => request(`/api/routes/${route.id}`, { method: "PUT", token, body: route }),
  buses: (token) => request("/api/buses", { token }),
  createBus: (token, bus) => request("/api/buses", { method: "POST", token, body: bus }),
  updateBus: (token, busId, bus) => request(`/api/buses/${busId}`, { method: "PUT", token, body: bus }),
  changeBusRoute: (token, busId, activeRouteId) =>
    request(`/api/buses/${busId}/active-route`, {
      method: "PUT",
      token,
      body: { active_route_id: activeRouteId }
    }),
  summary: () => request("/api/reports/summary"),
  daily: () => request("/api/reports/daily"),
  devices: () => request("/api/reports/devices"),
  latestTransactions: () => request("/api/reports/transactions?limit=100&offset=0"),
  cardTypes: () => request("/api/reports/card-types"),
  locations: () => request("/api/reports/bus-locations/latest")
};
