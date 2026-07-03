const loader = document.querySelector("#loader");
const coordReadout = document.querySelector("#coordReadout");
const toggleSpin = document.querySelector("#toggleSpin");
const flyThailand = document.querySelector("#flyThailand");
const flyOrbit = document.querySelector("#flyOrbit");
const zoomIn = document.querySelector("#zoomIn");
const zoomOut = document.querySelector("#zoomOut");
const uploadKmz = document.querySelector("#uploadKmz");
const kmzFile = document.querySelector("#kmzFile");
const kmzStatus = document.querySelector("#kmzStatus");
const kmzTabs = document.querySelector("#kmzTabs");

let viewer;
let spinning = true;
let userIsInteracting = false;
let resumeSpinAt = 0;
let uploadedDataSource;
let activeKmzButton;

function showError(error) {
  loader.classList.add("is-error");
  loader.textContent = "";

  const title = document.createElement("strong");
  title.textContent = "Could not start Earth Explorer";

  const message = document.createElement("span");
  message.textContent = error?.message || "Unknown startup error";

  loader.append(title, message);
}

function hideLoader() {
  loader.classList.add("is-hidden");
}

function easeInOutCubic(time) {
  return time < 0.5 ? 4 * time * time * time : 1 - Math.pow(-2 * time + 2, 3) / 2;
}

function updateReadout() {
  const cartographic = viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = Cesium.Math.toDegrees(cartographic.longitude);
  const heightKm = cartographic.height / 1000;
  coordReadout.textContent = `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}, Alt ${heightKm.toFixed(1)} km`;
}

function flyToThailand() {
  spinning = false;
  toggleSpin.textContent = "Play";
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(100.5018, 13.7563, 950000),
    orientation: {
      heading: Cesium.Math.toRadians(338),
      pitch: Cesium.Math.toRadians(-55),
      roll: 0,
    },
    duration: 3.2,
    easingFunction: easeInOutCubic,
  });
}

function flyToOrbit() {
  spinning = true;
  toggleSpin.textContent = "Pause";
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(96, 18, 18000000),
    orientation: {
      heading: Cesium.Math.toRadians(344),
      pitch: Cesium.Math.toRadians(-88),
      roll: 0,
    },
    duration: 3.4,
    easingFunction: easeInOutCubic,
  });
}

function zoom(multiplier) {
  const height = Math.max(viewer.camera.positionCartographic.height, 1000);
  viewer.camera.zoomIn(height * multiplier);
}

function pauseSpinBriefly() {
  resumeSpinAt = performance.now() + 2500;
}

function setKmzStatus(message, isError = false) {
  kmzStatus.textContent = message;
  kmzStatus.classList.toggle("is-error", isError);
}

async function showKmzDataSource(source, label, activeButton) {
  setKmzStatus("Loading...");
  spinning = false;
  toggleSpin.textContent = "Play";

  try {
    const dataSource = await Cesium.KmlDataSource.load(source, {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
      clampToGround: true,
    });

    if (uploadedDataSource) {
      viewer.dataSources.remove(uploadedDataSource, true);
    }

    uploadedDataSource = dataSource;
    await viewer.dataSources.add(dataSource);

    const entityCount = dataSource.entities.values.length;
    if (entityCount === 0) {
      setKmzStatus("No map items found", true);
      return;
    }

    if (activeKmzButton) {
      activeKmzButton.classList.remove("is-active");
    }
    activeKmzButton = activeButton || null;
    activeKmzButton?.classList.add("is-active");

    setKmzStatus(`${label} (${entityCount})`);
    await viewer.flyTo(dataSource, {
      duration: 2.8,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 0),
    });
  } catch (error) {
    setKmzStatus(error?.message || "Could not load KMZ", true);
  }
}

async function loadKmzFile(file) {
  if (!file) return;

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".kmz") && !lowerName.endsWith(".kml")) {
    setKmzStatus("Choose .kmz or .kml", true);
    return;
  }

  try {
    await showKmzDataSource(file, file.name, null);
  } finally {
    kmzFile.value = "";
  }
}

async function loadBundledKmzList() {
  try {
    const response = await fetch("./kmz/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("KMZ manifest not found");

    const files = await response.json();
    kmzTabs.textContent = "";

    if (!Array.isArray(files) || files.length === 0) {
      setKmzStatus("No bundled KMZ");
      return;
    }

    files.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "data-tab";
      button.textContent = item.name || item.file;
      button.addEventListener("click", () => {
        showKmzDataSource(`./kmz/${encodeURIComponent(item.file)}`, item.name || item.file, button);
      });
      kmzTabs.append(button);
    });

    if (files.length === 1) {
      setKmzStatus("Ready: bundled KMZ");
    }
  } catch (error) {
    setKmzStatus(error?.message || "Could not read KMZ list", true);
  }
}


function wireControls() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(() => {
    userIsInteracting = true;
    pauseSpinBriefly();
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  handler.setInputAction(() => {
    userIsInteracting = false;
    pauseSpinBriefly();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(() => {
    userIsInteracting = true;
    pauseSpinBriefly();
  }, Cesium.ScreenSpaceEventType.PINCH_START);
  handler.setInputAction(() => {
    userIsInteracting = false;
    pauseSpinBriefly();
  }, Cesium.ScreenSpaceEventType.PINCH_END);
  viewer.scene.canvas.addEventListener("wheel", pauseSpinBriefly, { passive: true });
}

function init() {
  if (!window.Cesium) {
    throw new Error("Cesium library did not load. Check your internet connection or CDN access.");
  }

  const satelliteImagery = new Cesium.UrlTemplateImageryProvider({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Earth imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maximumLevel: 19,
  });

  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    vrButton: false,
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    shouldAnimate: true,
  });

  const imageryLayer = viewer.imageryLayers.addImageryProvider(satelliteImagery);
  imageryLayer.brightness = 1.0;
  imageryLayer.contrast = 1.04;
  imageryLayer.saturation = 1.0;
  imageryLayer.gamma = 1.0;

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.skyAtmosphere.saturationShift = -0.04;
  viewer.scene.skyAtmosphere.brightnessShift = 0.0;
  viewer.scene.highDynamicRange = true;
  viewer.scene.fog.enabled = false;
  viewer.scene.postProcessStages.fxaa.enabled = true;
  viewer.scene.screenSpaceCameraController.inertiaSpin = 0.92;
  viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.86;
  viewer.scene.screenSpaceCameraController.inertiaZoom = 0.84;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 180;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45000000;
  viewer.camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(96, 18, 18000000),
    orientation: {
      heading: Cesium.Math.toRadians(344),
      pitch: Cesium.Math.toRadians(-88),
      roll: 0,
    },
  });

  wireControls();
  loadBundledKmzList();

  viewer.clock.onTick.addEventListener(() => {
    if (spinning && !userIsInteracting && performance.now() > resumeSpinAt) {
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.00012);
    }
    updateReadout();
  });

  setTimeout(hideLoader, 900);
}

toggleSpin.addEventListener("click", () => {
  spinning = !spinning;
  toggleSpin.textContent = spinning ? "Pause" : "Play";
});
flyThailand.addEventListener("click", flyToThailand);
flyOrbit.addEventListener("click", flyToOrbit);
zoomIn.addEventListener("click", () => zoom(0.42));
zoomOut.addEventListener("click", () => zoom(-0.7));
uploadKmz.addEventListener("click", () => kmzFile.click());
kmzFile.addEventListener("change", () => loadKmzFile(kmzFile.files[0]));

try {
  init();
} catch (error) {
  showError(error);
}
