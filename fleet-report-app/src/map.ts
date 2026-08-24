import { Map as OlMap, View, Feature } from "ol";
import ImageLayer from "ol/layer/Image.js";
import ImageStatic from "ol/source/ImageStatic.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import Style from "ol/style/Style.js";
import CircleStyle from "ol/style/Circle.js";
import RegularShape from "ol/style/RegularShape.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Text from "ol/style/Text.js";
import { fromLonLat } from "ol/proj.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import ScaleLine from "ol/control/ScaleLine.js";
import "ol/ol.css";
import basemapUrl from "./assets/harbor-basemap.webp";
import type { BoatRow } from "../fleet-data.js";
import { statusColor } from "./charts.js";

// Exact geographic bounds of the baked-in basemap image (real Oslo /
// Frognerkilen imagery, © OpenStreetMap contributors, © CARTO), computed
// from the source XYZ tile grid at build time.
const IMAGE_LON_MIN = 10.65673828125;
const IMAGE_LON_MAX = 10.777587890625;
const IMAGE_LAT_MIN = 59.86136748351593;
const IMAGE_LAT_MAX = 59.927495680882785;

interface Landmark {
  name: string;
  lat: number;
  lon: number;
  labelOffsetY: number;
}

// Real places in the bay — routes are drawn to these, not to arbitrary
// coordinates. Positions verified against the basemap imagery.
const LANDMARKS: Landmark[] = [
  { name: "Filipstad", lat: 59.91067, lon: 10.71802, labelOffsetY: -20 },
  { name: "Aker Brygge", lat: 59.9096, lon: 10.72274, labelOffsetY: 16 },
  { name: "Bygdøynes", lat: 59.90314, lon: 10.69871, labelOffsetY: -13 },
  { name: "Hovedøya", lat: 59.89604, lon: 10.73218, labelOffsetY: -13 },
  { name: "Lindøya", lat: 59.89195, lon: 10.7133, labelOffsetY: -13 },
  { name: "Nakholmen", lat: 59.89079, lon: 10.69425, labelOffsetY: -13 },
  { name: "Bleikøya", lat: 59.88958, lon: 10.74051, labelOffsetY: -13 },
];

// Precomputed water-only paths from each ocean boat's current position to
// its destination (A* over the real coastline, hugging clear of every
// island, simplified to a handful of waypoints). Straight lines would cut
// across land here — Frognerkilen bay is dense with islands.
const ROUTES: Record<string, Array<[number, number]>> = {
  "Sea Falcon": [[59.90164, 10.71794], [59.90758, 10.72429], [59.91067, 10.71802]],
  "Blue Horizon": [
    [59.88261, 10.68755], [59.88485, 10.69201], [59.88493, 10.69802], [59.88657, 10.70128],
    [59.88889, 10.70163], [59.88984, 10.70334], [59.89311, 10.71073], [59.89423, 10.71656],
    [59.89811, 10.72429], [59.89957, 10.73579], [59.89845, 10.73613], [59.89673, 10.73476],
    [59.89595, 10.73253], [59.89604, 10.73218],
  ],
  "Storm Petrel": [[59.90224, 10.70798], [59.90224, 10.70043], [59.90314, 10.69871]],
  "Windward": [[59.88769, 10.67433], [59.89182, 10.69219], [59.89079, 10.69425]],
  "Sunfish": [[59.88088, 10.70455], [59.88571, 10.71313], [59.88622, 10.72137], [59.89053, 10.73871], [59.88958, 10.74051]],
  "Kestrel": [
    [59.87675, 10.71845], [59.87994, 10.7109], [59.88088, 10.7097], [59.88252, 10.7097],
    [59.88709, 10.70128], [59.88967, 10.703], [59.89311, 10.7109], [59.89195, 10.7133],
  ],
  "Ocean Pearl": [
    [59.87899, 10.67073], [59.8851, 10.68292], [59.88769, 10.68292], [59.90577, 10.71897],
    [59.90577, 10.72257], [59.90809, 10.72515], [59.9096, 10.72274],
  ],
  "Tidewater": [[59.89742, 10.74386], [59.90491, 10.72892], [59.90809, 10.72515], [59.9096, 10.72274]],
};

function nearestLandmark(lat: number, lon: number): Landmark {
  return LANDMARKS.reduce((closest, lm) => {
    const d = (lm.lat - lat) ** 2 + (lm.lon - lon) ** 2;
    const dClosest = (closest.lm.lat - lat) ** 2 + (closest.lm.lon - lon) ** 2;
    return d < dClosest ? { lm, d } : closest;
  }, { lm: LANDMARKS[0], d: Infinity }).lm;
}

let mapInstance: OlMap | null = null;

/** Resolves a `var(--token)` expression to the browser's actual computed color for the current theme. */
function resolveCssColor(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

const tooltipEl = document.getElementById("tooltip") as HTMLDivElement;

function showTooltipAt(x: number, y: number, text: string) {
  tooltipEl.textContent = text;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
  tooltipEl.hidden = false;
}

function hideTooltip() {
  tooltipEl.hidden = true;
}

function landmarkStyle(name: string, offsetY: number, inkColor: string, haloColor: string): Style {
  return new Style({
    image: new RegularShape({
      points: 4,
      radius: 5,
      angle: Math.PI / 4,
      fill: new Fill({ color: haloColor }),
      stroke: new Stroke({ color: inkColor, width: 2 }),
    }),
    text: new Text({
      text: name,
      font: "10px sans-serif",
      offsetY,
      fill: new Fill({ color: inkColor }),
      stroke: new Stroke({ color: haloColor, width: 3 }),
    }),
  });
}

/**
 * Renders boats on a real-world basemap (baked-in Oslo/Frognerkilen imagery
 * — no live tile requests, so nothing can fail to load) using OpenLayers.
 * Boats out on the water (In Use/Reserved) get a dashed line to a named
 * real destination; docked boats (Idle/Maintenance) sit at their berth.
 */
export function renderHarborMap(container: HTMLElement, boats: BoatRow[]): void {
  if (mapInstance) {
    mapInstance.setTarget(undefined);
    mapInstance = null;
  }
  container.replaceChildren();

  const mapEl = document.createElement("div");
  mapEl.className = "harbor-map__ol";
  container.appendChild(mapEl);

  const inkColor = resolveCssColor("var(--color-text-primary)");
  const haloColor = resolveCssColor("var(--color-background-primary)");

  const imageExtent = [
    ...fromLonLat([IMAGE_LON_MIN, IMAGE_LAT_MIN]),
    ...fromLonLat([IMAGE_LON_MAX, IMAGE_LAT_MAX]),
  ] as [number, number, number, number];

  const basemapLayer = new ImageLayer({
    source: new ImageStatic({
      url: basemapUrl,
      imageExtent,
    }),
  });

  const overlaySource = new VectorSource();
  const overlayLayer = new VectorLayer({ source: overlaySource });

  for (const lm of LANDMARKS) {
    const feature = new Feature({ geometry: new Point(fromLonLat([lm.lon, lm.lat])) });
    feature.setStyle(landmarkStyle(lm.name, lm.labelOffsetY, inkColor, haloColor));
    overlaySource.addFeature(feature);
  }

  const colorCache = new Map<string, string>();
  const colorForStatus = (status: string): string => {
    let color = colorCache.get(status);
    if (!color) {
      color = resolveCssColor(statusColor(status));
      colorCache.set(status, color);
    }
    return color;
  };

  for (const boat of boats) {
    const color = colorForStatus(boat.status);

    let tooltipText = `${boat.boatName} — ${boat.status}`;
    if (boat.destLat != null && boat.destLon != null) {
      const destination = nearestLandmark(boat.destLat, boat.destLon);
      tooltipText += `, heading to ${destination.name}`;

      const waypoints = ROUTES[boat.boatName] ?? [[boat.lat, boat.lon], [destination.lat, destination.lon]];
      const routeFeature = new Feature({
        geometry: new LineString(waypoints.map(([lat, lon]) => fromLonLat([lon, lat]))),
      });
      routeFeature.setStyle(new Style({
        stroke: new Stroke({ color, width: 2, lineDash: [6, 6] }),
      }));
      overlaySource.addFeature(routeFeature);
    } else {
      tooltipText += ` (${boat.berth})`;
    }

    const boatFeature = new Feature({ geometry: new Point(fromLonLat([boat.lon, boat.lat])) });
    boatFeature.set("tooltip", tooltipText);
    boatFeature.setStyle(new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: haloColor, width: 2 }),
      }),
    }));
    overlaySource.addFeature(boatFeature);
  }

  // Fit to the actual data (boats + landmarks), not the whole baked-in
  // image — the image carries generous margin so the fit stays well inside
  // it, avoiding the fit()/extent-constraint conflict where both compute
  // resolution against the same box.
  const dataExtent = overlaySource.getExtent() ?? imageExtent;

  const map = new OlMap({
    target: mapEl,
    layers: [basemapLayer, overlayLayer],
    controls: defaultControls({ attribution: false }),
    view: new View({
      center: fromLonLat([(IMAGE_LON_MIN + IMAGE_LON_MAX) / 2, (IMAGE_LAT_MIN + IMAGE_LAT_MAX) / 2]),
      zoom: 2,
      extent: imageExtent,
    }),
  });
  map.updateSize();
  map.getView().fit(dataExtent, { padding: [28, 28, 28, 28] });
  map.addControl(new ScaleLine({ units: "metric" }));
  mapInstance = map;

  map.on("pointermove", (evt) => {
    if (evt.dragging) {
      hideTooltip();
      return;
    }
    const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
    const text = feature?.get("tooltip") as string | undefined;
    mapEl.style.cursor = text ? "pointer" : "";
    if (text) {
      const [x, y] = evt.pixel;
      const rect = mapEl.getBoundingClientRect();
      showTooltipAt(rect.left + x, rect.top + y, text);
    } else {
      hideTooltip();
    }
  });
  mapEl.addEventListener("pointerleave", hideTooltip);

  const credit = document.createElement("p");
  credit.className = "harbor-map__credit";
  credit.textContent = "Map data © OpenStreetMap contributors, © CARTO — routes shown for illustration only";
  container.appendChild(credit);

  const statusesPresent = new Set(boats.map((b) => b.status));
  const legend = document.createElement("div");
  legend.className = "harbor-map__legend";
  for (const status of ["In Use", "Reserved", "Idle", "Maintenance"].filter((s) => statusesPresent.has(s))) {
    const item = document.createElement("span");
    item.className = "harbor-map__legend-item";
    const swatch = document.createElement("span");
    swatch.className = "harbor-map__legend-swatch";
    swatch.style.background = statusColor(status);
    item.append(swatch, document.createTextNode(status));
    legend.appendChild(item);
  }
  container.appendChild(legend);
}
