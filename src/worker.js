import { handleEarthApi } from "./earthApi.js";

const HTML_CACHE_SECONDS = 60;
const CORS_METHODS = "GET, HEAD, OPTIONS";
const CORS_HEADERS = "Accept, Content-Type, If-None-Match, X-Request-ID";

function isAllowedCorsOrigin(origin, requestUrl) {
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const requestOrigin = new URL(requestUrl).origin;
    return origin === requestOrigin || parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1" || parsedOrigin.hostname.endsWith(".workers.dev");
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!isAllowedCorsOrigin(origin, request.url)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Expose-Headers": "Content-Length, Content-Type, ETag, X-Request-ID",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function withHeaders(response, headers) {
  const merged = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) merged.set(key, value);
  return new Response(response.body, { status: response.status, headers: merged });
}

function withCors(request, response) {
  return withHeaders(response, corsHeaders(request));
}

function preflightResponse(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

async function fetchStaticAsset(request, env, pathname) {
  if (!env?.STATIC_ASSETS?.fetch) return null;
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  assetUrl.search = "";
  return env.STATIC_ASSETS.fetch(new Request(assetUrl, request));
}

function htmlHeaders(response) {
  if (!response.headers.get("content-type")?.includes("text/html")) return response;
  return withHeaders(response, { "Cache-Control": `public, max-age=${HTML_CACHE_SECONDS}` });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return preflightResponse(request);
    }

    if (url.pathname.startsWith("/api/")) {
      const apiResponse = await handleEarthApi(request, env, {
        fetchStaticAsset: (pathname) => fetchStaticAsset(request, env, pathname),
      });
      return withCors(request, apiResponse || new Response("Not found", { status: 404 }));
    }

    if (!env?.STATIC_ASSETS?.fetch) {
      return new Response("Static asset binding is not configured", { status: 500 });
    }

    const response = await env.STATIC_ASSETS.fetch(request);
    if (response.status === 404 && url.pathname !== "/") {
      const fallback = await env.STATIC_ASSETS.fetch(new Request(new URL("/", url), request));
      return htmlHeaders(fallback);
    }

    return htmlHeaders(response);
  },
};
