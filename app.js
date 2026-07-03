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
const kmzDropdownButton = document.querySelector("#kmzDropdownButton");
const kmzSelectedLabel = document.querySelector("#kmzSelectedLabel");
const kmzDropdown = document.querySelector("#kmzDropdown");
const kmzSearch = document.querySelector("#kmzSearch");
const fieldInfoCard = document.querySelector("#fieldInfoCard");
const fieldInfoTitle = document.querySelector("#fieldInfoTitle");

const FIELD_FLY_HEIGHT_METERS = 500;
const LOGO_PATH = "./src/Logo.png";
let viewer;
let spinning = true;
let userIsInteracting = false;
let resumeSpinAt = 0;
let uploadedDataSource;
let overviewDataSource;
let activeKmzButton;
let bundledKmzFiles = [];
let fieldPinImagePromise;
let activeFieldInfoTitle = "-";
let fieldInfoHideLockedUntil = 0;
function normalizeFieldTitle(name) {
  if (!name) return "-";
  return String(name)
    .replace(/\.kmz$/i, "")
    .replace(/\s+(boundary glow|boundary highlight|yellow fill|center marker)$/i, "")
    .replace(/\s+boundary\s*\d*$/i, "")
    .trim() || "-";
}

function showFieldInfo(title) {
  activeFieldInfoTitle = normalizeFieldTitle(title);
  fieldInfoHideLockedUntil = performance.now() + 2500;
  fieldInfoTitle.textContent = activeFieldInfoTitle;
  fieldInfoCard.classList.add("is-visible");
}

function hideFieldInfo() {
  fieldInfoCard.classList.remove("is-visible");
}

function syncFieldInfoVisibility() {
  const height = viewer.camera.positionCartographic.height;
  if (height > 5000 && performance.now() > fieldInfoHideLockedUntil) {
    hideFieldInfo();
    return;
  }

  if (height <= 5000 && activeFieldInfoTitle !== "-") {
    fieldInfoCard.classList.add("is-visible");
  }
}
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
  const height = Math.max(viewer.camera.positionCartographic.height, 80);
  viewer.camera.zoomIn(height * multiplier);
}

function pauseSpinBriefly() {
  resumeSpinAt = performance.now() + 2500;
}

function setKmzStatus(message, isError = false) {
  kmzStatus.textContent = message;
  kmzStatus.classList.toggle("is-error", isError);
}

function createFieldPinImage(logo) {
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 138;

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(26, 12, 86, 118);
  gradient.addColorStop(0, "#38bdf8");
  gradient.addColorStop(0.48, "#0b63ce");
  gradient.addColorStop(1, "#07328f");

  ctx.save();
  ctx.shadowColor = "rgba(14, 165, 233, 0.76)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(56, 48, 38, 0, Math.PI * 2);
  ctx.moveTo(56, 130);
  ctx.lineTo(34, 78);
  ctx.quadraticCurveTo(56, 96, 78, 78);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(219, 234, 254, 0.98)";
  ctx.beginPath();
  ctx.arc(56, 48, 38, 0, Math.PI * 2);
  ctx.moveTo(56, 130);
  ctx.lineTo(34, 78);
  ctx.quadraticCurveTo(56, 96, 78, 78);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(56, 48, 27, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  if (logo) {
    const logoSize = 41;
    ctx.drawImage(logo, 56 - logoSize / 2, 48 - logoSize / 2, logoSize, logoSize);
  } else {
    ctx.fillStyle = "#0f3d91";
    ctx.font = "700 24px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BG", 56, 48);
  }

  return canvas.toDataURL("image/png");
}

function getFieldPinImage() {
  if (!fieldPinImagePromise) {
    fieldPinImagePromise = new Promise((resolve) => {
      const logo = new Image();
      logo.onload = () => resolve(createFieldPinImage(logo));
      logo.onerror = () => resolve(createFieldPinImage());
      logo.src = LOGO_PATH;
    });
  }

  return fieldPinImagePromise;
}
function getValue(property, time) {
  if (!property) return undefined;
  return typeof property.getValue === "function" ? property.getValue(time) : property;
}


function getPolygonPositions(entity, time) {
  const hierarchy = getValue(entity.polygon?.hierarchy, time);
  if (!hierarchy) return [];
  return hierarchy.positions || hierarchy;
}


function closePositions(positions) {
  if (positions.length < 2) return positions;
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (Cesium.Cartesian3.equalsEpsilon(first, last, Cesium.Math.EPSILON7)) return positions;
  return [...positions, first];
}

function getCenterFromPositions(positions) {
  if (!positions.length) return undefined;

  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const cartographic = Cesium.Cartographic.fromCartesian(sphere.center);
  return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0);
}

function getEntityTargetPosition(entity) {
  if (!entity) return undefined;
  if (entity.fieldTargetPosition) return entity.fieldTargetPosition;

  const time = viewer.clock.currentTime;
  const position = getValue(entity.position, time);
  if (position) return position;

  const polygonPositions = getPolygonPositions(entity, time);
  if (polygonPositions.length) return getCenterFromPositions(polygonPositions);

  const polylinePositions = getValue(entity.polyline?.positions, time);
  if (polylinePositions?.length) return getCenterFromPositions(polylinePositions);

  return undefined;
}

function flyToFieldEntity(entity, title) {
  const infoTitle = title || entity.fieldInfoTitle || entity.name || activeFieldInfoTitle;
  showFieldInfo(infoTitle);
  const target = getEntityTargetPosition(entity);
  if (!target) return false;

  const cartographic = Cesium.Cartographic.fromCartesian(target);
  spinning = false;
  toggleSpin.textContent = "Play";
  viewer.camera.cancelFlight();

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      FIELD_FLY_HEIGHT_METERS,
    ),
    orientation: {
      heading: viewer.camera.heading,
      pitch: Cesium.Math.toRadians(-86),
      roll: 0,
    },
    duration: 1.35,
    easingFunction: easeInOutCubic,
    complete: () => showFieldInfo(infoTitle),
  });

  return true;
}

function setCloseRangeVisibility(graphic, near = 0, far = 120000) {
  if (!graphic) return;
  graphic.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(near, far);
}

function stylePlacemarkVisibility(entity) {
  if (entity.billboard) entity.billboard.show = false;
  if (entity.label) entity.label.show = false;
  if (entity.point) entity.point.show = false;
}
function setEntityDistanceDisplay(entity, near, far) {
  const condition = new Cesium.DistanceDisplayCondition(near, far);
  if (entity.billboard) entity.billboard.distanceDisplayCondition = condition;
  if (entity.polyline) entity.polyline.distanceDisplayCondition = condition;
  if (entity.polygon) entity.polygon.distanceDisplayCondition = condition;
  if (entity.label) entity.label.distanceDisplayCondition = condition;
  if (entity.point) entity.point.distanceDisplayCondition = condition;
}

function addOverviewBoundary(dataSource, item, positions) {
  const loop = closePositions(positions);
  if (loop.length < 2) return;

  const center = getCenterFromPositions(positions);
  const boundary = dataSource.entities.add({
    name: `${item.name || item.file || "Field"} overview boundary`,
    polyline: {
      positions: loop,
      clampToGround: true,
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.16,
        taperPower: 0.35,
        color: Cesium.Color.fromCssColorString("#fff200").withAlpha(0.86),
      }),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6500000),
    },
  });
  boundary.fieldTargetPosition = center;
  boundary.fieldInfoTitle = item.name || item.file;
}
function addFilledOverlay(dataSource, entity, positions) {
  const fillEntity = dataSource.entities.add({
    name: `${entity.name || "Field"} yellow fill`,
    polygon: {
      hierarchy: positions,
      fill: true,
      outline: false,
      material: new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString("#ffe600").withAlpha(0.4),
      ),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      classificationType: Cesium.ClassificationType.TERRAIN,
      zIndex: 10,
    },
  });
  fillEntity.fieldTargetPosition = getCenterFromPositions(positions);
  fillEntity.fieldInfoTitle = entity.fieldInfoTitle || entity.name;
}
function addGlowingBoundary(dataSource, entity, positions) {
  const loop = closePositions(positions);
  if (loop.length < 2) return;

  const center = getCenterFromPositions(positions);
  entity.fieldTargetPosition = center;

  const glowEntity = dataSource.entities.add({
    name: `${entity.name || "Field"} boundary glow`,
    polyline: {
      positions: loop,
      clampToGround: true,
      width: 13,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.22,
        taperPower: 0.35,
        color: Cesium.Color.fromCssColorString("#ffe600").withAlpha(0.68),
      }),
    },
  });
  glowEntity.fieldTargetPosition = center;
  glowEntity.fieldInfoTitle = entity.fieldInfoTitle || entity.name;

  const highlightEntity = dataSource.entities.add({
    name: `${entity.name || "Field"} boundary highlight`,
    polyline: {
      positions: loop,
      clampToGround: true,
      width: 5,
      material: Cesium.Color.fromCssColorString("#fff200"),
    },
  });
  highlightEntity.fieldTargetPosition = center;
  highlightEntity.fieldInfoTitle = entity.fieldInfoTitle || entity.name;
}

function addCenterPin(dataSource, entity, center, image) {
  if (!center) return;

  const marker = dataSource.entities.add({
    name: `${entity.name || "Field"} center marker`,
    position: center,
    billboard: {
      image: image || createFieldPinImage(),
      width: 76,
      height: 94,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(500, 1.22, 18000000, 0.82),
    },
  });
  marker.fieldTargetPosition = center;
  marker.fieldInfoTitle = entity.fieldInfoTitle || entity.name;
  return marker;
}
async function styleKmzDataSource(dataSource) {
  const image = await getFieldPinImage();
  const time = viewer.clock.currentTime;
  const entities = dataSource.entities.values.slice();
  let fieldCount = 0;
  const fieldEntities = [];

  entities.forEach((entity) => {
    stylePlacemarkVisibility(entity);

    if (entity.polyline) {
      entity.polyline.width = 6;
      entity.polyline.clampToGround = true;
      entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.18,
        color: Cesium.Color.fromCssColorString("#fff200"),
      });
    }

    if (!entity.polygon) return;

    const positions = getPolygonPositions(entity, time);
    if (positions.length < 3) return;

    fieldCount += 1;
    entity.fieldInfoTitle = entity.name;
    fieldEntities.push(entity);
    entity.polygon.fill = false;
    entity.polygon.outline = false;
    entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;

    const center = getCenterFromPositions(positions);
    entity.fieldTargetPosition = center;
    addFilledOverlay(dataSource, entity, positions);
    addGlowingBoundary(dataSource, entity, positions);
    addCenterPin(dataSource, entity, center, image);
  });

  dataSource.fieldEntities = fieldEntities;
  return fieldCount;
}
async function loadOverviewPins(files) {
  if (overviewDataSource) {
    viewer.dataSources.remove(overviewDataSource, true);
  }

  const image = await getFieldPinImage();
  overviewDataSource = new Cesium.CustomDataSource("overview field markers");
  await viewer.dataSources.add(overviewDataSource);

  let markerCount = 0;
  for (const item of files) {
    try {
      const source = `./kmz/${encodeURIComponent(item.file)}`;
      const dataSource = await Cesium.KmlDataSource.load(source, {
        camera: viewer.scene.camera,
        canvas: viewer.scene.canvas,
        clampToGround: true,
      });

      const filePositions = [];
      dataSource.entities.values.forEach((entity) => {
        const positions = getPolygonPositions(entity, viewer.clock.currentTime);
        if (positions.length < 3) return;
        filePositions.push(...positions);
        addOverviewBoundary(overviewDataSource, item, positions);
      });

      const center = getCenterFromPositions(filePositions);
      const marker = addCenterPin(overviewDataSource, { name: item.name || item.file }, center, image);
      if (marker) {
        setEntityDistanceDisplay(marker, 0, 6500000);
        markerCount += 1;
      }
    } catch (error) {
      console.warn(`Could not read overview KMZ: ${item.file}`, error);
    }
  }

  setKmzStatus(markerCount > 0 ? `Ready: ${markerCount} field markers` : "Ready: bundled KMZ");
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

    const fieldCount = await styleKmzDataSource(dataSource);

    if (activeKmzButton) {
      activeKmzButton.classList.remove("is-active");
    }
    activeKmzButton = activeButton || null;
    activeKmzButton?.classList.add("is-active");

    setKmzStatus(`${label} (${fieldCount || entityCount})`);
    showFieldInfo(label);
    if (dataSource.fieldEntities?.length === 1) {
      flyToFieldEntity(dataSource.fieldEntities[0], label);
    } else {
      await viewer.flyTo(dataSource, {
        duration: 2.8,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 0),
      });
    }
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

function getKmzItemLabel(item) {
  return item?.name || item?.file || "Untitled KMZ";
}

function getKmzItemSource(item) {
  if (item?.url) return item.url;
  return `./kmz/${encodeURIComponent(item.file)}`;
}

function closeKmzDropdown() {
  kmzDropdown.hidden = true;
  kmzDropdownButton.setAttribute("aria-expanded", "false");
}

function openKmzDropdown() {
  kmzDropdown.hidden = false;
  kmzDropdownButton.setAttribute("aria-expanded", "true");
  kmzSearch.focus();
  kmzSearch.select();
}

function renderKmzOptions(files, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFiles = files
    .filter((item) => {
      const label = getKmzItemLabel(item).toLowerCase();
      const file = String(item?.file || "").toLowerCase();
      const province = String(item?.province || "").toLowerCase();
      const project = String(item?.project || "").toLowerCase();
      return !normalizedQuery || `${label} ${file} ${province} ${project}`.includes(normalizedQuery);
    })
    .slice(0, 12);

  kmzTabs.textContent = "";
  if (visibleFiles.length === 0) {
    const empty = document.createElement("span");
    empty.className = "kmz-empty";
    empty.textContent = "No results";
    kmzTabs.append(empty);
    return;
  }

  visibleFiles.forEach((item) => {
    const label = getKmzItemLabel(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "data-tab";
    button.textContent = label;
    button.setAttribute("role", "option");
    if (activeKmzButton?.dataset?.file === item.file) {
      button.classList.add("is-active");
    }
    button.dataset.file = item.file || label;
    button.addEventListener("click", () => {
      kmzSelectedLabel.textContent = label;
      closeKmzDropdown();
      showKmzDataSource(getKmzItemSource(item), label, button);
    });
    kmzTabs.append(button);
  });
}
async function loadBundledKmzList() {
  try {
    const response = await fetch("./kmz/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("KMZ manifest not found");

    const files = await response.json();
    bundledKmzFiles = Array.isArray(files) ? files : [];
    kmzTabs.textContent = "";

    if (bundledKmzFiles.length === 0) {
      kmzSelectedLabel.textContent = "No bundled KMZ";
      setKmzStatus("No bundled KMZ");
      return;
    }

    kmzSelectedLabel.textContent = "Select data";
    renderKmzOptions(bundledKmzFiles);
    loadOverviewPins(bundledKmzFiles);
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
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    if (!picked?.id) return;
    showFieldInfo(picked.id.fieldInfoTitle || picked.id.name);
    flyToFieldEntity(picked.id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
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
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 40;
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
    syncFieldInfoVisibility();
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
kmzDropdownButton.addEventListener("click", () => {
  if (kmzDropdown.hidden) {
    openKmzDropdown();
  } else {
    closeKmzDropdown();
  }
});
kmzSearch.addEventListener("input", () => renderKmzOptions(bundledKmzFiles, kmzSearch.value));
kmzSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeKmzDropdown();
    kmzDropdownButton.focus();
    return;
  }
  if (event.key === "Enter") {
    const firstOption = kmzTabs.querySelector(".data-tab");
    firstOption?.click();
  }
});
document.addEventListener("click", (event) => {
  if (kmzDropdown.hidden) return;
  if (event.target === kmzDropdownButton || kmzDropdownButton.contains(event.target)) return;
  if (kmzDropdown.contains(event.target)) return;
  closeKmzDropdown();
});

try {
  init();
} catch (error) {
  showError(error);
}
