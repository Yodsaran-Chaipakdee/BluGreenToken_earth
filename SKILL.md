# Blu Green Token Earth Skill

## Project Purpose

This project is a CesiumJS 3D Earth explorer for Blu Green Token field-map KMZ data. It should feel like a focused operational map, not a marketing page. The first screen should remain the globe view with brand, controls, KMZ/data selector, field markers, and map interaction.

## Current Data Flow

- Local KMZ files live in `kmz/`.
- `kmz/manifest.json` lists available datasets using `{ "name", "file" }` objects.
- `app.js` loads the manifest, creates data controls, creates overview field markers, and loads selected KMZ data into Cesium.
- KMZ source pins/labels are hidden; the app uses custom blue logo markers instead.
- Selected field polygons use yellow translucent fill and glowing yellow boundary lines.
- The field info card opens on field selection and auto-hides above the configured altitude threshold.

## Future Data Source: Cloudflare

The future target is 100+ KMZ field maps served from Cloudflare, likely Cloudflare R2 or a Cloudflare Worker/API. Do not hardcode hundreds of KMZ buttons in HTML.

Preferred future shape:

```json
[
  {
    "id": "30-VSD-field-map",
    "name": "30-VSD-field-map",
    "file": "30-VSD-field-map.kmz",
    "url": "https://.../30-VSD-field-map.kmz"
  }
]
```

Implementation guidance:

- Keep `manifest.json` compatibility for local development.
- Add a configurable remote manifest URL later, for example `KMZ_MANIFEST_URL` or a top-level constant in `app.js`.
- If the remote item has `url`, load from `url`; otherwise load from `./kmz/${file}`.
- Cache should not hide fresh field data during development; use `fetch(..., { cache: "no-store" })` for manifests unless production caching is explicitly planned.
- Cloudflare must send correct CORS headers for browser KMZ fetches.

## Data Selector UX

When the number of KMZ files grows beyond a few items, replace the current tab/button list with a searchable selector:

- Use a dropdown/search combobox instead of one button per file.
- Support typing by project code, filename, province, or any future metadata field.
- Keep keyboard behavior simple: type to filter, Enter selects highlighted result, Escape closes.
- Show only a small number of visible results, for example 8-12, to avoid a tall panel.
- Keep the existing Upload KMZ control for ad-hoc local testing.
- For 100+ entries, do not load every full KMZ into the active scene at startup. Prefer loading overview marker metadata from the manifest if available.

Recommended future manifest fields for faster overview markers:

```json
{
  "id": "67-STC-field-map",
  "name": "67-STC-field-map",
  "url": "https://.../67-STC-field-map.kmz",
  "center": { "lat": 8.4099, "lon": 98.5441 },
  "province": "-",
  "project": "-"
}
```

If `center` exists, create the overview marker directly from it. Only load the KMZ when the user selects that field. This avoids downloading 100+ KMZ files on first load.

## Interaction Rules

- Opening the app should show the globe/orbit view, not auto-open a field.
- Overview markers should show available fields on the globe.
- Selecting a field should load the KMZ, zoom to the field at close altitude, and open the field info card in one action.
- Field info card values can remain `-` until real metadata exists.
- Hide source KMZ red pins/labels; use the app's blue logo marker only.
- Keep polygon fill translucent enough for imagery to remain readable.

## Visual Style

- Brand text color: `#123c8c`.
- Info card should match the current app style: white surface, rounded corners, blue title, soft shadow, no visible scrollbar.
- Avoid adding large explanatory text in the UI.
- Keep controls compact and operational.

## Verification Checklist

Before pushing changes:

1. Run `node --check app.js`.
2. Confirm `kmz/manifest.json` parses with `JSON.parse`.
3. Open `http://127.0.0.1:5179/` when visual behavior changed.
4. Check that app startup remains the orbit/globe view.
5. Check that selecting a field opens the card on the first click.
6. Check that source KMZ red pins are hidden.
7. Check that new KMZ entries appear in the selector/control.