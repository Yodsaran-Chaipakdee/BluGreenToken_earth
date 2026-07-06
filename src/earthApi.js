const API_PREFIX = "/api/v1";
const DEFAULT_KMZ_PREFIX = "kmz/";
const DEFAULT_MANIFEST_FILE = "manifest.json";
const DEFAULT_MANGROVE_API_BASE_URL = "https://mangrove-drone-dashboard.saratchai.workers.dev/api/v1";

const KMZ_CONTENT_TYPES = {
  ".kmz": "application/vnd.google-earth.kmz",
  ".kml": "application/vnd.google-earth.kml+xml; charset=utf-8",
};

function noStoreJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function contentTypeForKmzFile(fileName) {
  const lower = fileName.toLowerCase();
  const ext = Object.keys(KMZ_CONTENT_TYPES).find((suffix) => lower.endsWith(suffix));
  return ext ? KMZ_CONTENT_TYPES[ext] : "application/octet-stream";
}

function cleanPrefix(prefix) {
  const value = String(prefix || DEFAULT_KMZ_PREFIX).replace(/^\/+/, "");
  return value.endsWith("/") ? value : `${value}/`;
}

function safeKmzFileName(value) {
  const decoded = decodeURIComponent(String(value || ""));
  const fileName = decoded.split(/[\\/]/).pop();
  if (!fileName || fileName !== decoded || fileName.includes("..")) return null;
  if (!/\.(kmz|kml)$/i.test(fileName)) return null;
  return fileName;
}

function normalizeApiBaseUrl(value) {
  const base = String(value || DEFAULT_MANGROVE_API_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

function remoteApiHeaders(env) {
  const headers = new Headers({ Accept: "application/json" });
  if (env?.MANGROVE_DEV_USER_EMAIL) headers.set("x-dev-user", env.MANGROVE_DEV_USER_EMAIL);
  if (env?.MANGROVE_API_TOKEN) headers.set("Authorization", `Bearer ${env.MANGROVE_API_TOKEN}`);
  return headers;
}

function itemsFromEnvelope(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.files)) return data.files;
  return [];
}

function safePlotFileName(plot) {
  const raw = String(plot?.id || plot?.plotId || plot?.code || "").trim();
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe ? `${safe}.kmz` : null;
}

function normalizePlotItems(data) {
  return itemsFromEnvelope(data)
    .map((plot) => {
      const file = safePlotFileName(plot);
      if (!file) return null;
      const plotCode = plot?.code || plot?.plotCode || "";
      const name = [plotCode, plot?.name].filter(Boolean).join(" - ") || file.replace(/\.kmz$/i, "");
      return {
        name,
        file,
        plotCode,
        province: plot?.province || plot?.locationProvince || "",
        district: plot?.district || plot?.amphoe || plot?.amphur || plot?.locationDistrict || "",
        subdistrict: plot?.subdistrict || plot?.tambon || plot?.locationSubdistrict || "",
        project: plot?.project || plot?.locationName || plot?.location_name || "",
        url: `${API_PREFIX}/earth/kmz/${encodeURIComponent(file)}`,
      };
    })
    .filter(Boolean);
}

function fileNameToPlotId(fileName) {
  return fileName.replace(/\.(kmz|kml)$/i, "");
}

async function fetchRemoteJson(env, path) {
  const base = normalizeApiBaseUrl(env?.MANGROVE_API_BASE_URL);
  const response = await fetch(`${base}${path}`, {
    headers: remoteApiHeaders(env),
  });
  if (!response.ok) {
    throw new Error(`Remote API ${path} returned ${response.status}`);
  }
  return response.json();
}

async function loadManifestFromRemoteApi(env) {
  if (env?.KMZ_SOURCE === "local") return null;
  const plots = await fetchRemoteJson(env, "/plots");
  const items = normalizePlotItems(plots);
  return items.length ? items : null;
}

async function getKmzObjectFromRemoteApi(env, fileName) {
  if (env?.KMZ_SOURCE === "local") return null;
  const plotId = fileNameToPlotId(fileName);
  const base = normalizeApiBaseUrl(env?.MANGROVE_API_BASE_URL);
  const response = await fetch(`${base}/plots/${encodeURIComponent(plotId)}.kmz`, {
    headers: remoteApiHeaders(env),
  });
  if (!response.ok) return null;
  return {
    body: response.body,
    size: Number(response.headers.get("Content-Length") || 0),
    httpEtag: response.headers.get("ETag") || undefined,
    httpMetadata: { contentType: response.headers.get("Content-Type") || contentTypeForKmzFile(fileName) },
  };
}
function manifestItemsFromJson(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.files)) return data.files;
  return [];
}

function normalizeManifestItems(data) {
  return manifestItemsFromJson(data)
    .map((item) => {
      const file = safeKmzFileName(item?.file || item?.fileName || item?.name);
      if (!file) return null;
      return {
        name: item?.name || file.replace(/\.(kmz|kml)$/i, ""),
        file,
        plotCode: item?.plotCode || "",
        province: item?.province || "",
        district: item?.district || item?.amphoe || item?.amphur || "",
        subdistrict: item?.subdistrict || item?.tambon || "",
        project: item?.project || "",
        url: item?.url || `${API_PREFIX}/earth/kmz/${encodeURIComponent(file)}`,
      };
    })
    .filter(Boolean);
}

async function readJsonObject(object) {
  const text = await object.text();
  return JSON.parse(text);
}

async function loadManifestFromR2(env) {
  if (!env?.KMZ_BUCKET?.get) return null;
  const prefix = cleanPrefix(env.KMZ_PREFIX);
  const manifestFile = safeKmzFileName(env.KMZ_MANIFEST_FILE || DEFAULT_MANIFEST_FILE) || DEFAULT_MANIFEST_FILE;
  const object = await env.KMZ_BUCKET.get(`${prefix}${manifestFile}`);
  if (!object) return null;
  return readJsonObject(object);
}

async function loadManifestFromStatic(context) {
  if (!context?.fetchStaticAsset) return null;
  const response = await context.fetchStaticAsset(`/kmz/${DEFAULT_MANIFEST_FILE}`);
  if (!response?.ok) return null;
  return response.json();
}

async function getKmzObjectFromR2(env, fileName) {
  if (!env?.KMZ_BUCKET?.get) return null;
  const prefix = cleanPrefix(env.KMZ_PREFIX);
  return env.KMZ_BUCKET.get(`${prefix}${fileName}`);
}

async function getKmzObjectFromStatic(context, fileName) {
  if (!context?.fetchStaticAsset) return null;
  const response = await context.fetchStaticAsset(`/kmz/${encodeURIComponent(fileName)}`);
  if (!response?.ok) return null;
  return {
    body: response.body,
    size: Number(response.headers.get("Content-Length") || 0),
    httpEtag: response.headers.get("ETag") || undefined,
    httpMetadata: { contentType: response.headers.get("Content-Type") || contentTypeForKmzFile(fileName) },
  };
}

export async function handleEarthApi(request, env = {}, context = {}) {
  const url = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return noStoreJson({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET and HEAD are supported" } }, 405);
  }

  if (url.pathname === `${API_PREFIX}/health`) {
    return noStoreJson({ ok: true, service: "BluGreenToken_earth", version: "1" });
  }

  if (url.pathname === `${API_PREFIX}/earth/kmz-manifest`) {
        let manifest = null;
    try {
      manifest = await loadManifestFromRemoteApi(env);
    } catch (error) {
      console.warn("Remote KMZ manifest API failed, falling back", error);
    }
    manifest = manifest || (await loadManifestFromR2(env)) || (await loadManifestFromStatic(context));
    if (!manifest) {
      return noStoreJson({ error: { code: "KMZ_MANIFEST_NOT_FOUND", message: "KMZ manifest not found" } }, 404);
    }
    return noStoreJson(normalizeManifestItems(manifest));
  }

  const kmzPrefix = `${API_PREFIX}/earth/kmz/`;
  if (url.pathname.startsWith(kmzPrefix)) {
    const fileName = safeKmzFileName(url.pathname.slice(kmzPrefix.length));
    if (!fileName) {
      return noStoreJson({ error: { code: "BAD_KMZ_FILE", message: "Invalid KMZ/KML file name" } }, 400);
    }

        let object = null;
    try {
      object = await getKmzObjectFromRemoteApi(env, fileName);
    } catch (error) {
      console.warn(`Remote KMZ API failed for ${fileName}, falling back`, error);
    }
    object = object || (await getKmzObjectFromR2(env, fileName)) || (await getKmzObjectFromStatic(context, fileName));
    if (!object) {
      return noStoreJson({ error: { code: "KMZ_NOT_FOUND", message: `KMZ/KML file not found: ${fileName}` } }, 404);
    }

    const headers = new Headers({
      "Content-Type": object.httpMetadata?.contentType || contentTypeForKmzFile(fileName),
      "Cache-Control": "private, max-age=60, must-revalidate",
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
    });
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    if (object.size) headers.set("Content-Length", String(object.size));

    if (request.method === "HEAD") return new Response(null, { headers });
    return new Response(object.body, { headers });
  }

  if (url.pathname.startsWith(`${API_PREFIX}/`)) {
    return noStoreJson({ error: { code: "NOT_FOUND", message: "API route not found" } }, 404);
  }

  return null;
}

export const earthApiInternals = {
  safeKmzFileName,
  normalizeManifestItems,
  contentTypeForKmzFile,
};
