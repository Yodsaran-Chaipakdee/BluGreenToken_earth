import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { handleEarthApi } from "../src/earthApi.js";

const root = resolve(process.cwd());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contentTypeFor(pathname) {
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".kmz")) return "application/vnd.google-earth.kmz";
  if (pathname.endsWith(".kml")) return "application/vnd.google-earth.kml+xml; charset=utf-8";
  return "application/octet-stream";
}

async function staticAsset(pathname) {
  const localPath = resolve(root, pathname.replace(/^\/+/, ""));
  if (!localPath.startsWith(root) || !existsSync(localPath)) {
    return new Response("Not found", { status: 404 });
  }
  const body = await readFile(localPath);
  return new Response(body, { headers: { "Content-Type": contentTypeFor(pathname), "Content-Length": String(body.byteLength) } });
}

function localBucket() {
  return {
    async get(key) {
      const response = await staticAsset(`/${key}`);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        body: bytes,
        size: bytes.byteLength,
        httpMetadata: { contentType: response.headers.get("Content-Type") },
        async text() {
          return new TextDecoder().decode(bytes);
        },
      };
    },
  };
}

async function request(pathname, env = { KMZ_SOURCE: "local", KMZ_BUCKET: localBucket(), KMZ_PREFIX: "kmz/" }) {
  return handleEarthApi(new Request(`http://127.0.0.1:5179${pathname}`), env, { fetchStaticAsset: staticAsset });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).endsWith("/api/v1/plots")) {
    return new Response(JSON.stringify({
      data: [
        { id: "plot-remote-001", code: "R-001", name: "Remote one", province: "Chanthaburi" },
        { id: "plot-remote-002", code: "R-002", name: "Remote two", province: "Trat" },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  return originalFetch(url);
};
const remoteManifest = await request("/api/v1/earth/kmz-manifest", { MANGROVE_API_BASE_URL: "https://example.test/api/v1" });
globalThis.fetch = originalFetch;
assert(remoteManifest.status === 200, `remote manifest status ${remoteManifest.status}`);
const remoteJson = await remoteManifest.json();
assert(remoteJson.length === 2, "remote manifest did not use API plot list");
assert(remoteJson[0].file === "plot-remote-001.kmz", "remote manifest file did not derive from plot id");
assert(remoteJson[0].url === "/api/v1/earth/kmz/plot-remote-001.kmz", "remote manifest API url missing");
const health = await request("/api/v1/health");
assert(health.status === 200, `health status ${health.status}`);
const healthJson = await health.json();
assert(healthJson.ok === true, "health ok flag missing");

const manifest = await request("/api/v1/earth/kmz-manifest");
assert(manifest.status === 200, `manifest status ${manifest.status}`);
const manifestJson = await manifest.json();
assert(Array.isArray(manifestJson), "manifest is not an array");
assert(manifestJson.length > 0, "manifest is empty");
assert(manifestJson.every((item) => item.url?.startsWith("/api/v1/earth/kmz/")), "manifest item API urls missing");

const firstFile = manifestJson[0].file;
const kmz = await request(`/api/v1/earth/kmz/${encodeURIComponent(firstFile)}`);
assert(kmz.status === 200, `kmz status ${kmz.status}`);
assert((kmz.headers.get("Content-Type") || "").includes("kmz"), "kmz content type missing");

const missing = await request("/api/v1/earth/kmz/missing-file.kmz");
assert(missing.status === 404, `missing-file status ${missing.status}`);

const fallbackManifest = await request("/api/v1/earth/kmz-manifest", {});
assert(fallbackManifest.status === 200, `fallback manifest status ${fallbackManifest.status}`);
const fallbackJson = await fallbackManifest.json();
assert(fallbackJson.length > 0, "fallback manifest is empty");

const appJs = await readFile(resolve(root, "app.js"), "utf8");
assert(appJs.includes("KMZ_MANIFEST_API"), "frontend API manifest constant missing");
assert(appJs.includes("fetchKmzManifest(KMZ_MANIFEST_API)"), "frontend API-first fetch missing");
assert(appJs.includes("fetchKmzManifest(LOCAL_KMZ_MANIFEST)"), "frontend local fallback missing");
assert(appJs.includes("const source = getKmzItemSource(item);"), "loadOverviewPins does not use getKmzItemSource(item)");

console.log("api-smoke: ok");

