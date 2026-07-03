# Earth Explorer

CesiumJS prototype for a Google Earth style 3D globe without Google assets or branding.

## What is local

- CesiumJS `1.143.0` is vendored in `vendor/cesium`.
- The default globe uses Cesium's bundled Natural Earth II imagery, so the core demo can render without CDN JavaScript.
- This demo intentionally does not use Google Earth imagery or tiles.

## Run

```powershell
cd C:\InternYodsaran\earth-google-style
python -m http.server 5179 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:5179/
```

## Notes

CesiumJS gives the right camera model, globe coordinates, atmosphere, and tile-ready architecture. To zoom into high-detail satellite imagery like Google Earth, connect a properly licensed imagery/terrain tile provider.
