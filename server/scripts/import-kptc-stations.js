import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_PAGES = [
  "https://gulfcommute.com/kuwait/bus/route-15",
  "https://gulfcommute.com/kuwait/bus"
];
const DEFAULT_API_BASE = "http://localhost:3000";
const USER_AGENT = "KPTC-Reporting-Station-Importer/1.0 (station catalog maintenance)";
const GOOGLE_DELAY_MS = Number(process.env.KPTC_GOOGLE_DELAY_MS || 900);
const CACHE_PATH = process.env.KPTC_STATION_CACHE_PATH || join(tmpdir(), "kptc-google-stations.json");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipGoogle = args.has("--skip-google");
const apiBase = String(process.env.KPTC_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&");
}

function decodeStringLiteral(value) {
  return JSON.parse(value);
}

function stationId(name) {
  const normalized = String(name || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `S${normalized}`;
}

function inKuwait(latitude, longitude) {
  return latitude >= 28.4 && latitude <= 30.2 && longitude >= 46.5 && longitude <= 49;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  return response.text();
}

async function loadSourceChunk() {
  for (const sourcePage of SOURCE_PAGES) {
    const html = await fetchText(sourcePage);
    const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]);
    for (const scriptPath of [...new Set(scriptPaths)]) {
      const chunk = await fetchText(new URL(scriptPath, sourcePage));
      if (chunk.includes("kuwait:{buses:[") && chunk.includes("stops:[")) return chunk;
    }
  }
  throw new Error("Could not locate the Kuwait route data in the source pages");
}

function parseKptcCatalog(chunk) {
  const start = chunk.indexOf("t={kuwait");
  const end = chunk.indexOf("},dubai:", start);
  if (start < 0 || end < 0) throw new Error("Unexpected Kuwait data format");

  const kuwait = chunk.slice(start, end);
  const stopsStart = kuwait.indexOf("stops:[");
  const literal = '("(?:\\\\.|[^"\\\\])*")';
  const routePattern = new RegExp(
    `\\{nameEn:${literal},nameAr:${literal},routeEn:${literal},routeAr:${literal}`,
    "g"
  );
  const stopPattern = new RegExp(`\\{name:${literal},lat:([-0-9.]+),lon:([-0-9.]+)\\}`, "g");

  const coordinatesById = new Map();
  let match;
  while ((match = stopPattern.exec(kuwait.slice(stopsStart)))) {
    const name = decodeStringLiteral(match[1]);
    const latitude = Number(match[2]);
    const longitude = Number(match[3]);
    if (inKuwait(latitude, longitude)) {
      coordinatesById.set(stationId(name), { latitude, longitude });
    }
  }

  const groups = new Map();
  const routeNames = [];
  while ((match = routePattern.exec(kuwait.slice(0, stopsStart)))) {
    const routeName = decodeStringLiteral(match[1]);
    if (!/^Route\s/.test(routeName)) continue;
    routeNames.push(routeName);

    const namesEn = decodeStringLiteral(match[3]).split(" - ").map((value) => value.trim()).filter(Boolean);
    const namesAr = decodeStringLiteral(match[4]).split(" - ").map((value) => value.trim()).filter(Boolean);
    if (routeName === "Route 999" && namesAr.length === namesEn.length + 1) {
      namesAr[namesEn.length - 1] = namesAr.slice(namesEn.length - 1).join(" – ");
    }

    for (let index = 0; index < namesEn.length; index += 1) {
      const nameEn = namesEn[index];
      const id = stationId(nameEn);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({
        name_en: nameEn.replace(/\.$/, ""),
        name_ar: namesAr[index] || null
      });
    }
  }

  const stations = [...groups.entries()].map(([id, aliases]) => {
    const coordinates = coordinatesById.get(id) || null;
    return {
      id,
      station_code: id.slice(1),
      ...aliases[0],
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      is_active: true
    };
  }).sort((left, right) => left.name_en.localeCompare(right.name_en));

  return { stations, routeNames };
}

async function loadCoordinateCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveCoordinateCache(cache) {
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function googleResultCoordinates(payload) {
  const placePattern = /\[null,null,(2[89]\.[0-9]+),(4[678]\.[0-9]+)\],"0x[0-9a-f]+:0x[0-9a-f]+","((?:\\.|[^"\\])*)"/gi;
  for (const match of payload.matchAll(placePattern)) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (inKuwait(latitude, longitude)) {
      return { latitude, longitude, google_name: decodeStringLiteral(`"${match[3]}"`) };
    }
  }

  const coordinatePattern = /\[null,null,(2[89]\.[0-9]+),(4[678]\.[0-9]+)\]/g;
  const matches = [...payload.matchAll(coordinatePattern)]
    .map((match) => ({ latitude: Number(match[1]), longitude: Number(match[2]) }))
    .filter(({ latitude, longitude }) => inKuwait(latitude, longitude));
  return matches[1] || matches[0] || null;
}

function usableGoogleCoordinates(station, coordinates) {
  if (!coordinates) return false;
  const googleName = String(coordinates.google_name || "").trim().toLowerCase();
  const stationName = String(station.name_en || "").trim().toLowerCase();

  if (googleName === "city bus station" && stationName !== "city bus station") {
    return false;
  }

  return true;
}

async function lookupGoogleCoordinates(name) {
  const query = `${name} bus stop, Kuwait`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const html = await fetchText(mapsUrl);
  const preload = html.match(/<link href="([^"]*\/search\?tbm=map[^"]+)" as="fetch"/);
  if (!preload) return null;
  const payload = await fetchText(new URL(decodeHtml(preload[1]), "https://www.google.com"));
  return googleResultCoordinates(payload);
}

async function completeCoordinates(stations) {
  const cache = await loadCoordinateCache();
  let lookedUp = 0;
  for (const station of stations) {
    if (station.latitude != null && station.longitude != null) continue;
    if (cache[station.id]) {
      if (usableGoogleCoordinates(station, cache[station.id])) {
        station.latitude = cache[station.id].latitude;
        station.longitude = cache[station.id].longitude;
      }
      continue;
    }
    if (skipGoogle) continue;

    if (lookedUp > 0) await sleep(GOOGLE_DELAY_MS);
    const coordinates = await lookupGoogleCoordinates(station.name_en);
    lookedUp += 1;
    if (!usableGoogleCoordinates(station, coordinates)) {
      console.warn(`No Google Maps coordinates found for ${station.name_en}`);
      continue;
    }
    station.latitude = coordinates.latitude;
    station.longitude = coordinates.longitude;
    cache[station.id] = coordinates;
    await saveCoordinateCache(cache);
    console.log(`Resolved ${station.name_en}: ${station.latitude}, ${station.longitude}`);
  }
  return lookedUp;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed with HTTP ${response.status}: ${payload.error || payload.message || "unknown error"}`);
  }
  return payload;
}

async function login() {
  const username = process.env.KPTC_ADMIN_USERNAME;
  const password = process.env.KPTC_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("KPTC_ADMIN_USERNAME and KPTC_ADMIN_PASSWORD are required for import");
  }
  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  return result.token;
}

function sameCoordinate(left, right) {
  if (left == null && right == null) return true;
  return Math.abs(Number(left) - Number(right)) < 0.0000001;
}

async function importStations(stations) {
  const token = await login();
  const headers = { authorization: `Bearer ${token}` };
  const current = await apiRequest("/api/stations", { headers });
  const existingById = new Map(current.data.map((station) => [station.id, station]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const station of stations) {
    const existing = existingById.get(station.id);
    const body = JSON.stringify(station);
    if (!existing) {
      await apiRequest("/api/stations", { method: "POST", headers, body });
      created += 1;
      continue;
    }
    if (
      existing.name_en === station.name_en &&
      (existing.name_ar || null) === (station.name_ar || null) &&
      sameCoordinate(existing.latitude, station.latitude) &&
      sameCoordinate(existing.longitude, station.longitude)
    ) {
      unchanged += 1;
      continue;
    }
    await apiRequest(`/api/stations/${encodeURIComponent(station.id)}`, { method: "PUT", headers, body });
    updated += 1;
  }
  return { created, updated, unchanged, total: stations.length };
}

const chunk = await loadSourceChunk();
const { stations, routeNames } = parseKptcCatalog(chunk);
const lookedUp = await completeCoordinates(stations);
const missingCoordinates = stations.filter((station) => station.latitude == null || station.longitude == null);

console.log(`KPTC routes: ${routeNames.length}`);
console.log(`Unique stations: ${stations.length}`);
console.log(`Google Maps lookups: ${lookedUp}`);
console.log(`Stations without coordinates: ${missingCoordinates.length}`);
if (missingCoordinates.length) {
  console.log(missingCoordinates.map((station) => station.name_en).join("\n"));
}

if (dryRun) {
  console.log("Dry run complete; no station records were changed");
} else {
  const result = await importStations(stations);
  console.log(`Import complete: ${JSON.stringify(result)}`);
}
