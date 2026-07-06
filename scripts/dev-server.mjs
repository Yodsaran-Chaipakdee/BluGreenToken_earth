import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { handleEarthApi, earthApiInternals } from "../src/earthApi.js";

const root = resolve(process.cwd());
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5179);

async function loadDotEnvFile(fileName) {
  const envPath = resolve(root, fileName);
  if (!existsSync(envPath)) return {};
  const text = await readFile(envPath, "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function pickServerEnv(values) {
  const keys = [
    "KMZ_SOURCE",
    "KMZ_PREFIX",
    "MANGROVE_API_BASE_URL",
    "MANGROVE_DEV_USER_EMAIL",
    "MANGROVE_API_TOKEN",
  ];
  return Object.fromEntries(keys.filter((key) => values[key]).map((key) => [key, values[key]]));
}
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".kmz": "application/vnd.google-earth.kmz",
  ".kml": "application/vnd.google-earth.kml+xml; charset=utf-8",
};

function typeFor(pathname) {
  return contentTypes[extname(pathname).toLowerCase()] || "application/octet-stream";
}

function localPathFor(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

async function staticResponse(pathname, method = "GET") {
  const filePath = localPathFor(pathname);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const stats = statSync(filePath);
  const headers = new Headers({
    "Content-Type": typeFor(filePath),
    "Content-Length": String(stats.size),
    "Cache-Control": pathname.includes("/kmz/") ? "no-store" : "public, max-age=60",
  });

  if (method === "HEAD") return new Response(null, { headers });
  return new Response(Readable.toWeb(createReadStream(filePath)), { headers });
}

function localBucket() {
  return {
    async get(key) {
      const normalizedKey = key.replace(/^\/+/, "");
      const fileName = earthApiInternals.safeKmzFileName(normalizedKey.split(/[\\/]/).pop());
      if (!fileName && !normalizedKey.endsWith("manifest.json")) return null;
      const response = await staticResponse(`/${normalizedKey}`);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const etag = `"${createHash("sha1").update(bytes).digest("hex")}"`;
      return {
        body: bytes,
        size: bytes.byteLength,
        httpEtag: etag,
        httpMetadata: { contentType: response.headers.get("Content-Type") || typeFor(normalizedKey) },
        async text() {
          return new TextDecoder().decode(bytes);
        },
      };
    },
  };
}

async function requestFromIncoming(req) {
  const url = `http://${req.headers.host || `${host}:${port}`}${req.url}`;
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers: req.headers });
  }
  return new Request(url, { method: req.method, headers: req.headers, body: Readable.toWeb(req), duplex: "half" });
}

async function sendNodeResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

const dotEnv = {
  ...(await loadDotEnvFile(".env")),
  ...(await loadDotEnvFile(".env.local")),
};

const env = {
  KMZ_BUCKET: localBucket(),
  KMZ_PREFIX: "kmz/",
  MANGROVE_DEV_USER_EMAIL: "tc@example.test",
  ...pickServerEnv(dotEnv),
};

createServer(async (req, res) => {
  try {
    const request = await requestFromIncoming(req);
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const response = await handleEarthApi(request, env, {
        fetchStaticAsset: (pathname) => staticResponse(pathname, request.method),
      });
      await sendNodeResponse(res, response || new Response("Not found", { status: 404 }));
      return;
    }

    const response = await staticResponse(url.pathname, request.method);
    await sendNodeResponse(res, response);
  } catch (error) {
    const body = JSON.stringify({ error: { code: "DEV_SERVER_ERROR", message: error.message } });
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
  }
}).listen(port, host, () => {
  console.log(`Earth Explorer dev server: http://${host}:${port}/`);
});

