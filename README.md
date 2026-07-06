# Earth Explorer

CesiumJS prototype for a Google Earth style 3D globe without Google assets or branding.

## Run locally

```powershell
cd C:\InternYodsaran\earth-google-style
npm run dev
```

Open:

```text
http://127.0.0.1:5179/
```

`npm run dev` starts a lightweight local Node server that serves the static Earth Explorer and the KMZ API routes on the same port.

## API routes

- `GET /api/v1/health`
- `GET /api/v1/earth/kmz-manifest`
- `GET /api/v1/earth/kmz/:fileName`

The frontend loads `/api/v1/earth/kmz-manifest` first. If that fails, it falls back to `./kmz/manifest.json` for offline/demo use. Manual KMZ/KML upload remains browser-local.

## Cloudflare Worker

`src/worker.js` is the Cloudflare Worker entrypoint. It uses the `KMZ_BUCKET` R2 binding when available and falls back to bundled static `kmz/` files for local/demo behavior.

```powershell
npm install
npm run worker:dev
```

Do not put cloud credentials in frontend code. Use Cloudflare Worker bindings, environment variables, and secrets for cloud access.
