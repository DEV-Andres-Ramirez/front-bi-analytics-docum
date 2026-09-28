"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import type { Feature, FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "@/components/widgets/kit/chart-tooltip";
import { cn } from "@/lib/cn";
import { CO_SILHOUETTE, MAINLAND, MAX_BOUNDS, type BBox } from "@/lib/geo/bounds";
import type { BaseGeo, MpioFC } from "./geo-data";

/**
 * Lienzo Mapbox del HeroMap (mapRedesign 3–5, 9 y 10).
 * - Cámara: fitBounds(MAINLAND) con padding fijo, maxBounds, minZoom = encuadre − 0,25,
 *   sin rotación ni pitch; re-encuadre en resize mientras el usuario no haya movido el mapa.
 * - Capas propias antes de la primera capa symbol del estilo (las etiquetas de valor, arriba de todo);
 *   se re-agregan de forma idempotente en cada "style.load" (cambio de tema = setStyle).
 * - Los manejadores de Mapbox leen el estado vivo desde refs actualizadas en efectos.
 */

export const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLE_LIGHT = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11";
const STYLE_DARK = process.env.NEXT_PUBLIC_MAPBOX_STYLE_DARK || "mapbox://styles/mapbox/dark-v11";
export const styleFor = (mode: "light" | "dark") => (mode === "dark" ? STYLE_DARK : STYLE_LIGHT);
/** Respaldo si el estilo configurado no carga (p. ej. el gemelo oscuro aún no existe en Studio). */
const FALLBACK = { light: "mapbox://styles/mapbox/light-v11", dark: "mapbox://styles/mapbox/dark-v11" } as const;

const PADDING = { top: 20, right: 16, bottom: 12, left: 16 };
const MAX_ZOOM = 10.5;
const LABEL_FONT = ["DIN Pro Bold", "Arial Unicode MS Bold"];

const OWN_LAYERS = ["mask-fill", "co-glow", "dptos-fill", "dptos-nodata", "mpios-fill", "mpios-nodata", "mpios-line", "dptos-line", "co-outline", "dptos-hl", "mpios-hl", "value-labels"];
const OWN = new Set(OWN_LAYERS);

export interface MapPalette {
  mode: "light" | "dark";
  surface: string;
  surface3: string;
  text: string;
  text2: string;
  primary: string;
  primaryStrong: string;
}

export interface LabelProps {
  code: string;
  name: string;
  value: string;
  /** −valor: symbol-sort-key (el mayor se coloca primero). */
  sk: number;
}
export type LabelFC = FeatureCollection<Point, LabelProps>;

export interface MapCanvasApi {
  /** Encuadra una caja (animada salvo reduced-motion). Cuenta como movimiento del usuario. */
  focus: (bbox: BBox, maxZoom?: number) => void;
  /** Vuelve al encuadre del nivel actual (Colombia o el departamento abierto). */
  reset: () => void;
  /** PNG del lienzo (se captura dentro del evento "render"). */
  snapshot: () => Promise<{ url: string; width: number; height: number } | null>;
}

export interface MapCanvasProps {
  base: BaseGeo | null;
  mpios: MpioFC | null;
  level: "dpto" | "mpio";
  /** Departamento abierto (nivel municipios). */
  drill: string | null;
  /** Caja del nivel actual (MAINLAND o la del departamento abierto). */
  frame: BBox;
  fills: Record<string, string>;
  mpioFills: Record<string, string>;
  selected: string | null;
  /** Códigos filtrados en el nivel actual (filters.eq.__dpto / __mpio). */
  filtered: string[];
  hovered: string | null;
  labels: LabelFC;
  palette: MapPalette;
  allowDrill: boolean;
  ariaLabel: string;
  /** Cómo se usa el lienzo (aria-describedby): reemplaza la pista visible "Clic… · doble clic…" (legendSystem L12). */
  ariaDescription?: string;
  tooltipFor: (code: string, level: "dpto" | "mpio") => TooltipContent | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string | null) => void;
  onDrill: (code: string) => void;
  onReady: (api: MapCanvasApi | null) => void;
  onError: (message: string) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

type Live = MapCanvasProps;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function matchColor(fills: Record<string, string>, fallback: string): string | ExpressionSpecification {
  const pairs = Object.entries(fills).flat();
  return pairs.length ? ["match", ["get", "code"], ...pairs, fallback] : fallback;
}

function inFilter(codes: string[]): FilterSpecification {
  return ["in", ["get", "code"], ["literal", codes]];
}

/**
 * Rayado de "Sin registros" en oscuro: ahí la primera clase (seq-2) y surface-3 solo se separan
 * ≈ 15 L* y por el matiz; la textura agrega un segundo canal (también para daltonismo).
 */
const HATCH = "docum-nodata-hatch";
const HATCH_PX = 12; // imagen de 12 px a pixelRatio 2 = rayas a 45° cada 6 px CSS

function hatchImage(color: string): { width: number; height: number; data: Uint8Array } {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  const full = hex ? (hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex) : "9aa1ab";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const data = new Uint8Array(HATCH_PX * HATCH_PX * 4);
  for (let y = 0; y < HATCH_PX; y++)
    for (let x = 0; x < HATCH_PX; x++) {
      if ((x + y) % HATCH_PX >= 2) continue;
      const i = (y * HATCH_PX + x) * 4;
      [data[i], data[i + 1], data[i + 2], data[i + 3]] = [r, g, b, 72];
    }
  return { width: HATCH_PX, height: HATCH_PX, data };
}

/** Agrega el rayado si falta (cada setStyle lo borra); con `refresh`, lo repinta con la paleta actual. */
function ensureHatch(map: MapboxMap, palette: MapPalette, refresh = false) {
  if (!map.hasImage(HATCH)) map.addImage(HATCH, hatchImage(palette.text2), { pixelRatio: 2 });
  else if (refresh) map.updateImage(HATCH, hatchImage(palette.text2));
}

/** Códigos sin registros (sin color de clase): los que no están en `fills`. */
function noDataFilter(fills: Record<string, string>): FilterSpecification {
  return ["!", ["in", ["get", "code"], ["literal", Object.keys(fills)]]];
}

function firstSymbolId(map: MapboxMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol" && !OWN.has(l.id))?.id;
}

/** Capa de ciudades del estilo base que se conserva, con su filtro y zoom originales. */
interface CityLayer {
  id: string;
  filter?: FilterSpecification;
  minzoom: number;
  maxzoom: number;
}

/** Solo las ciudades principales (place_label · settlement-major) sobreviven del mapa base. */
const CITY_LAYER = /^settlement-major-label$|^settlement-label$/;
/** En la vista de departamentos las ciudades solo aparecen al acercarse (la coropleta y sus rótulos mandan). */
const CITY_MINZOOM_DPTO = 6.5;
/** DANE (2 dígitos) → ISO 3166-2 (campo iso_3166_2 de place_label en Mapbox Streets v8). */
const DPTO_ISO: Record<string, string> = {
  "05": "CO-ANT", "08": "CO-ATL", "11": "CO-DC", "13": "CO-BOL", "15": "CO-BOY", "17": "CO-CAL", "18": "CO-CAQ", "19": "CO-CAU",
  "20": "CO-CES", "23": "CO-COR", "25": "CO-CUN", "27": "CO-CHO", "41": "CO-HUI", "44": "CO-LAG", "47": "CO-MAG", "50": "CO-MET",
  "52": "CO-NAR", "54": "CO-NSA", "63": "CO-QUI", "66": "CO-RIS", "68": "CO-SAN", "70": "CO-SUC", "73": "CO-TOL", "76": "CO-VAC",
  "81": "CO-ARA", "85": "CO-CAS", "86": "CO-PUT", "88": "CO-SAP", "91": "CO-AMA", "94": "CO-GUA", "95": "CO-GUV", "97": "CO-VAU", "99": "CO-VID",
};

/**
 * Etiquetas del mapa base (se llama en cada "style.load"): fuera POI, vías, rótulos naturales,
 * país ("Colombia" sobre el Meta competía con los datos), departamentos y ciudades menores.
 * Devuelve las capas de ciudades principales, que `applyCityLabels` ajusta según el nivel.
 */
function tameBaseLabels(map: MapboxMap): CityLayer[] {
  const cities: CityLayer[] = [];
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol" || OWN.has(layer.id)) continue;
    try {
      const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
      if (sourceLayer === "place_label" && CITY_LAYER.test(layer.id)) {
        const l = layer as { filter?: FilterSpecification; minzoom?: number; maxzoom?: number };
        cities.push({ id: layer.id, filter: l.filter, minzoom: l.minzoom ?? 0, maxzoom: l.maxzoom ?? 24 });
      } else {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    } catch {
      /* capa que no admite el cambio: se deja como está */
    }
  }
  return cities;
}

/**
 * Ciudades del mapa base según el nivel: en departamentos, solo de Colombia y desde el zoom 6,5
 * (la vista nacional queda limpia); en municipios, las del departamento abierto con su zoom original.
 */
function applyCityLabels(map: MapboxMap, cities: CityLayer[], level: "dpto" | "mpio", drill: string | null) {
  const iso = level === "mpio" && drill ? DPTO_ISO[drill] : undefined;
  for (const c of cities) {
    if (!map.getLayer(c.id)) continue;
    try {
      const parts: FilterSpecification[] = [["==", ["get", "iso_3166_1"], "CO"]];
      if (c.filter) parts.unshift(c.filter);
      // Sin iso_3166_2 en la tesela: se conserva (mejor un rótulo vecino que ninguno)
      if (iso) parts.push(["any", ["!", ["has", "iso_3166_2"]], ["==", ["get", "iso_3166_2"], iso]] as FilterSpecification);
      map.setFilter(c.id, ["all", ...parts] as FilterSpecification);
      map.setLayerZoomRange(c.id, level === "mpio" ? c.minzoom : Math.max(c.minzoom, CITY_MINZOOM_DPTO), c.maxzoom);
      map.setLayoutProperty(c.id, "visibility", "visible");
    } catch {
      try {
        map.setLayoutProperty(c.id, "visibility", "none");
      } catch {
        /* capa retirada por un setStyle en curso */
      }
    }
  }
}

/** Agrega fuentes y capas propias que falten (idempotente). Devuelve true si todo está listo. */
function ensureLayers(map: MapboxMap, p: Live): boolean {
  const { base, palette } = p;
  if (!base) return false;
  const before = firstSymbolId(map);
  const src = (id: string, data: FeatureCollection) => {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data, promoteId: "code" });
  };
  src("mask", base.mask);
  src("outline", base.outline);
  src("dptos", base.dptos);
  if (!map.getSource("labels")) map.addSource("labels", { type: "geojson", data: p.labels });
  ensureHatch(map, palette);
  const add = (spec: Parameters<MapboxMap["addLayer"]>[0], beforeId?: string) => {
    if (!map.getLayer(spec.id)) map.addLayer(spec, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
  };
  add({ id: "mask-fill", type: "fill", source: "mask", paint: { "fill-color": palette.surface, "fill-opacity": palette.mode === "dark" ? 0.86 : 0.82 } }, before);
  add({ id: "co-glow", type: "line", source: "outline", paint: { "line-color": palette.primary, "line-opacity": 0.22, "line-width": 8, "line-blur": 6 } }, before);
  add({ id: "dptos-fill", type: "fill", source: "dptos", paint: { "fill-color": palette.surface3, "fill-opacity": 0.92 } }, before);
  add({ id: "dptos-nodata", type: "fill", source: "dptos", layout: { visibility: "none" }, filter: noDataFilter(p.fills), paint: { "fill-pattern": HATCH } }, before);
  add(
    {
      id: "dptos-line",
      type: "line",
      source: "dptos",
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "hover"], false], palette.text, palette.surface],
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.8],
      },
    },
    before,
  );
  add({ id: "co-outline", type: "line", source: "outline", paint: { "line-color": palette.text2, "line-opacity": 0.6, "line-width": 1 } }, before);
  add({ id: "dptos-hl", type: "line", source: "dptos", filter: inFilter([]), paint: { "line-color": palette.primaryStrong, "line-width": 2.5 } }, before);
  add({
    id: "value-labels",
    type: "symbol",
    source: "labels",
    layout: {
      "text-field": ["format", ["get", "name"], { "font-scale": 0.92 }, "\n", {}, ["get", "value"], { "font-scale": 1 }],
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-line-height": 1.15,
      "text-max-width": 9,
      // Diagonales al final: en el centro del país (Bogotá, Cundinamarca, Antioquia, Boyacá) los
      // rótulos de dos líneas no caben en las cinco posiciones básicas
      "text-variable-anchor": ["center", "top", "bottom", "left", "right", "bottom-left", "bottom-right", "top-left", "top-right"],
      "text-radial-offset": 0.5,
      "text-justify": "auto",
      "symbol-sort-key": ["get", "sk"],
      "text-padding": 2,
    },
    paint: { "text-color": palette.text, "text-halo-color": palette.surface, "text-halo-width": 1.5 },
  });
  ensureMpioLayers(map, p);
  return true;
}

function ensureMpioLayers(map: MapboxMap, p: Live) {
  if (!p.mpios) return;
  const { palette } = p;
  const source = map.getSource("mpios") as GeoJSONSource | undefined;
  if (!source) map.addSource("mpios", { type: "geojson", data: p.mpios, promoteId: "code" });
  const beforeLine = map.getLayer("dptos-line") ? "dptos-line" : firstSymbolId(map);
  if (!map.getLayer("mpios-fill")) map.addLayer({ id: "mpios-fill", type: "fill", source: "mpios", paint: { "fill-color": palette.surface3, "fill-opacity": 0.95 } }, beforeLine);
  if (!map.getLayer("mpios-nodata"))
    map.addLayer({ id: "mpios-nodata", type: "fill", source: "mpios", layout: { visibility: "none" }, filter: noDataFilter(p.mpioFills), paint: { "fill-pattern": HATCH } }, beforeLine);
  if (!map.getLayer("mpios-line"))
    map.addLayer(
      {
        id: "mpios-line",
        type: "line",
        source: "mpios",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "hover"], false], palette.text, palette.surface],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.5],
        },
      },
      beforeLine,
    );
  if (!map.getLayer("mpios-hl")) map.addLayer({ id: "mpios-hl", type: "line", source: "mpios", filter: inFilter([]), paint: { "line-color": palette.primaryStrong, "line-width": 2.5 } }, map.getLayer("value-labels") ? "value-labels" : undefined);
}

/** Aplica colores, visibilidad, selección y etiquetas desde el estado vivo. */
function applyState(map: MapboxMap, p: Live) {
  if (!map.getLayer("dptos-fill")) return;
  const { palette, level, drill } = p;
  const mpio = level === "mpio" && Boolean(drill) && Boolean(p.mpios);
  map.setPaintProperty("dptos-fill", "fill-color", matchColor(p.fills, palette.surface3));
  const dimDptos = level === "dpto" && p.filtered.length > 0;
  map.setPaintProperty(
    "dptos-fill",
    "fill-opacity",
    mpio ? ["case", ["==", ["get", "code"], drill as string], 0, 0.25] : dimDptos ? ["case", ["in", ["get", "code"], ["literal", p.filtered]], 0.92, 0.4] : 0.92,
  );
  const hl = level === "dpto" ? [...new Set([...(p.selected ? [p.selected] : []), ...p.filtered])] : [];
  map.setFilter("dptos-hl", inFilter(hl));
  const dark = palette.mode === "dark";
  if (map.getLayer("dptos-nodata")) {
    map.setFilter("dptos-nodata", noDataFilter(p.fills));
    map.setLayoutProperty("dptos-nodata", "visibility", dark && !mpio ? "visible" : "none");
  }
  if (map.getLayer("mpios-fill")) {
    const vis = mpio ? "visible" : "none";
    for (const id of ["mpios-fill", "mpios-line", "mpios-hl"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    if (map.getLayer("mpios-nodata")) {
      map.setFilter("mpios-nodata", noDataFilter(p.mpioFills));
      map.setLayoutProperty("mpios-nodata", "visibility", dark && mpio ? "visible" : "none");
    }
    map.setPaintProperty("mpios-fill", "fill-color", matchColor(p.mpioFills, palette.surface3));
    const dimM = mpio && p.filtered.length > 0;
    map.setPaintProperty("mpios-fill", "fill-opacity", dimM ? ["case", ["in", ["get", "code"], ["literal", p.filtered]], 0.95, 0.4] : 0.95);
    const mhl = mpio ? [...new Set([...(p.selected ? [p.selected] : []), ...p.filtered])] : [];
    if (map.getLayer("mpios-hl")) map.setFilter("mpios-hl", inFilter(mhl));
  }
}

/** Colores dependientes del tema en capas ya creadas (el setStyle las recrea, pero el tema puede cambiar sin estilo nuevo). */
function applyPalette(map: MapboxMap, palette: MapPalette) {
  if (!map.getLayer("mask-fill")) return;
  ensureHatch(map, palette, true);
  map.setPaintProperty("mask-fill", "fill-color", palette.surface);
  map.setPaintProperty("mask-fill", "fill-opacity", palette.mode === "dark" ? 0.86 : 0.82);
  map.setPaintProperty("co-glow", "line-color", palette.primary);
  map.setPaintProperty("co-outline", "line-color", palette.text2);
  map.setPaintProperty("dptos-line", "line-color", ["case", ["boolean", ["feature-state", "hover"], false], palette.text, palette.surface]);
  map.setPaintProperty("dptos-hl", "line-color", palette.primaryStrong);
  map.setPaintProperty("value-labels", "text-color", palette.text);
  map.setPaintProperty("value-labels", "text-halo-color", palette.surface);
  if (map.getLayer("mpios-line")) map.setPaintProperty("mpios-line", "line-color", ["case", ["boolean", ["feature-state", "hover"], false], palette.text, palette.surface]);
  if (map.getLayer("mpios-hl")) map.setPaintProperty("mpios-hl", "line-color", palette.primaryStrong);
}

function codeAt(map: MapboxMap, e: MapMouseEvent, layer: string): string | null {
  if (!map.getLayer(layer)) return null;
  const f = map.queryRenderedFeatures(e.point, { layers: [layer] })[0];
  const code = f?.properties?.code ?? f?.id;
  return code === undefined || code === null ? null : String(code);
}

interface DevWindow {
  __documMaps?: MapboxMap[];
}

export function MapCanvas(props: MapCanvasProps) {
  const { palette, ariaLabel, ariaDescription, children, className, style } = props;
  const descId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const live = useRef<Live>(props);
  const styleReady = useRef(false);
  const userMoved = useRef(false);
  const appliedStyle = useRef<string | null>(null);
  const appliedData = useRef<{ labels: LabelFC | null; mpios: MpioFC | null }>({ labels: null, mpios: null });
  const hoverApplied = useRef<{ source: string; id: string } | null>(null);
  const cityLayers = useRef<CityLayer[]>([]);
  /** Nivel ya aplicado a las ciudades del mapa base ("tick|nivel|departamento"). */
  const cityApplied = useRef("");
  const [styleTick, setStyleTick] = useState(0);
  /** Estilo base listo (cámara y tema pueden operar). */
  const [loaded, setLoaded] = useState(false);
  /** Coropleta dibujada: la silueta del skeleton se retira solo entonces (no con el estilo vacío). */
  const [painted, setPainted] = useState(false);
  const { state: tip, show, hide } = useChartTooltip();
  const tipFns = useRef({ show, hide });

  useEffect(() => {
    live.current = props;
    tipFns.current = { show, hide };
  });

  // ─── Montaje ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!TOKEN || !container) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let map: MapboxMap | null = null;

    const frameTo = (m: MapboxMap, bbox: BBox, animate: boolean, maxZoom?: number) => {
      const c = m.getContainer();
      if (c.clientWidth < 40 || c.clientHeight < 40) return;
      m.resize();
      const main = m.cameraForBounds(MAINLAND, { padding: PADDING });
      if (main && typeof main.zoom === "number") m.setMinZoom(Math.max(0, main.zoom - 0.25));
      m.fitBounds(bbox, { padding: PADDING, duration: animate && !reduced() ? 650 : 0, maxZoom: maxZoom ?? MAX_ZOOM, essential: true });
    };

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (disposed) return;
      mapboxgl.accessToken = TOKEN;
      const style = styleFor(live.current.palette.mode);
      appliedStyle.current = style;
      // El contenedor no tiene hijos de React: se limpia por si quedó algo de un montaje previo
      container.replaceChildren();
      map = new mapboxgl.Map({
        container,
        style,
        bounds: MAINLAND,
        fitBoundsOptions: { padding: PADDING },
        maxBounds: MAX_BOUNDS,
        maxZoom: MAX_ZOOM,
        renderWorldCopies: false,
        projection: "mercator",
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        doubleClickZoom: false,
        cooperativeGestures: true,
        attributionControl: false,
        logoPosition: "bottom-right",
        locale: {
          "ScrollZoomBlocker.CtrlMessage": "Usa Ctrl + rueda del mouse para acercar el mapa",
          "ScrollZoomBlocker.CmdMessage": "Usa ⌘ + rueda del mouse para acercar el mapa",
          "TouchPanBlocker.Message": "Usa dos dedos para mover el mapa",
        },
      });
      mapRef.current = map;
      const m = map;
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      m.getCanvas().setAttribute("aria-label", live.current.ariaLabel);

      if (process.env.NODE_ENV !== "production") {
        const w = window as unknown as DevWindow;
        w.__documMaps = [...(w.__documMaps ?? []), m];
      }

      let first = true;
      const setup = () => {
        styleReady.current = true;
        appliedData.current = { labels: live.current.labels, mpios: live.current.mpios };
        hoverApplied.current = null;
        try {
          cityLayers.current = tameBaseLabels(m);
          applyCityLabels(m, cityLayers.current, live.current.level, live.current.drill);
          cityApplied.current = "";
          if (ensureLayers(m, live.current)) applyState(m, live.current);
        } catch (err) {
          console.error("[HeroMap] capas", err);
        }
        if (first && !disposed) {
          // Primer estilo listo: encuadre (no se espera a "load", que depende de todas las teselas)
          first = false;
          frameTo(m, live.current.frame, false);
          setLoaded(true);
        }
        setStyleTick((t) => t + 1);
      };
      m.on("style.load", setup);

      // Fin del skeleton: cuando la fuente de departamentos está cargada y su capa existe
      // (la geografía llega aparte del estilo; antes solo se vería el fondo beige del mapa base)
      let isPainted = false;
      const markPainted = () => {
        if (isPainted || disposed || !m.getLayer("dptos-fill") || !m.getSource("dptos") || !m.isSourceLoaded("dptos")) return;
        isPainted = true;
        m.once("render", () => {
          if (!disposed) setPainted(true);
        });
        m.triggerRepaint();
      };
      m.on("sourcedata", (e) => {
        if ((e as { sourceId?: string }).sourceId === "dptos") markPainted();
      });
      m.on("idle", markPainted);
      m.on("error", (e) => {
        if (styleReady.current || disposed) return;
        const url = (e.error as { url?: string } | undefined)?.url ?? "";
        const fallback = FALLBACK[live.current.palette.mode];
        if (/\/styles\//.test(url) && appliedStyle.current !== fallback) {
          appliedStyle.current = fallback;
          m.setStyle(fallback, { diff: false } as Parameters<MapboxMap["setStyle"]>[1]);
          return;
        }
        if (/\/styles\//.test(url) || !url) live.current.onError(e.error?.message ?? "No fue posible cargar el mapa base.");
      });
      m.on("movestart", (e) => {
        if ((e as { originalEvent?: Event }).originalEvent) userMoved.current = true;
      });

      // Hover y tooltip
      const onMove = (layer: "dptos-fill" | "mpios-fill") => (e: MapMouseEvent) => {
        const p = live.current;
        const lvl = layer === "dptos-fill" ? "dpto" : "mpio";
        if ((lvl === "dpto") !== (p.level === "dpto")) return;
        const code = codeAt(m, e, layer);
        if (!code) return;
        m.getCanvas().style.cursor = "pointer";
        if (p.hovered !== code) p.onHover(code);
        const content = p.tooltipFor(code, lvl);
        const oe = e.originalEvent as MouseEvent;
        if (content && oe) tipFns.current.show(oe.clientX, oe.clientY, content);
      };
      const onLeave = () => {
        m.getCanvas().style.cursor = "";
        live.current.onHover(null);
        tipFns.current.hide();
      };
      m.on("mousemove", "dptos-fill", onMove("dptos-fill"));
      m.on("mouseleave", "dptos-fill", onLeave);
      m.on("mousemove", "mpios-fill", onMove("mpios-fill"));
      m.on("mouseleave", "mpios-fill", onLeave);
      m.on("mouseout", onLeave);

      // Clic: selección inmediata (sin temporizador). Doble clic: municipios (solo escritorio).
      m.on("click", (e) => {
        const p = live.current;
        const code = codeAt(m, e, p.level === "mpio" ? "mpios-fill" : "dptos-fill");
        p.onSelect(code);
      });
      m.on("dblclick", (e) => {
        const p = live.current;
        if (!p.allowDrill || p.level !== "dpto") return;
        const code = codeAt(m, e, "dptos-fill");
        if (code) p.onDrill(code);
      });

      // Re-encuadre sin animación mientras el usuario no haya movido el mapa
      ro = new ResizeObserver(() => {
        m.resize();
        if (!userMoved.current && styleReady.current) frameTo(m, live.current.frame, false);
      });
      ro.observe(container);

      live.current.onReady({
        focus: (bbox, maxZoom) => {
          userMoved.current = true;
          frameTo(m, bbox, true, maxZoom);
        },
        reset: () => {
          userMoved.current = false;
          frameTo(m, live.current.frame, true);
        },
        snapshot: () =>
          new Promise((resolve) => {
            let done = false;
            const finish = (v: { url: string; width: number; height: number } | null) => {
              if (done) return;
              done = true;
              resolve(v);
            };
            m.once("render", () => {
              try {
                const c = m.getCanvas();
                finish({ url: c.toDataURL("image/png"), width: c.width, height: c.height });
              } catch {
                finish(null);
              }
            });
            m.triggerRepaint();
            setTimeout(() => finish(null), 4000);
          }),
      });
    })().catch((err: unknown) => {
      if (!disposed) live.current.onError(err instanceof Error ? err.message : "No fue posible inicializar el mapa.");
    });

    return () => {
      disposed = true;
      ro?.disconnect();
      live.current.onReady(null);
      tipFns.current.hide();
      if (map) {
        if (process.env.NODE_ENV !== "production") {
          const w = window as unknown as DevWindow;
          w.__documMaps = (w.__documMaps ?? []).filter((x) => x !== map);
        }
        map.remove();
      }
      mapRef.current = null;
      styleReady.current = false;
    };
  }, []);

  // ─── Tema: estilo base propio por modo ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const next = styleFor(palette.mode);
    if (appliedStyle.current === next) {
      if (styleReady.current) {
        applyPalette(map, palette);
        applyState(map, live.current);
      }
      return;
    }
    appliedStyle.current = next;
    styleReady.current = false;
    map.setStyle(next, { diff: false } as Parameters<MapboxMap["setStyle"]>[1]);
  }, [palette, loaded]);

  // ─── Datos y estado → capas ────────────────────────────────────────────────
  const { base, mpios, labels, fills, mpioFills, level, drill, selected, filtered } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    try {
      ensureLayers(map, live.current);
      const lab = map.getSource("labels") as GeoJSONSource | undefined;
      if (lab && appliedData.current.labels !== labels) {
        lab.setData(labels);
        appliedData.current.labels = labels;
      }
      const ms = map.getSource("mpios") as GeoJSONSource | undefined;
      if (ms && mpios && appliedData.current.mpios !== mpios) {
        ms.setData(mpios);
        appliedData.current.mpios = mpios;
      }
      applyState(map, live.current);
      const cityKey = `${styleTick}|${level}|${drill ?? ""}`;
      if (cityApplied.current !== cityKey) {
        applyCityLabels(map, cityLayers.current, level, drill);
        cityApplied.current = cityKey;
      }
    } catch (err) {
      console.error("[HeroMap] estado", err);
    }
  }, [styleTick, base, mpios, labels, fills, mpioFills, level, drill, selected, filtered]);

  // ─── Encuadre al cambiar de nivel (abrir departamento / volver a Colombia) ──
  const { frame } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const c = map.getContainer();
    if (c.clientWidth < 40 || c.clientHeight < 40) return;
    map.resize();
    const main = map.cameraForBounds(MAINLAND, { padding: PADDING });
    if (main && typeof main.zoom === "number") map.setMinZoom(Math.max(0, main.zoom - 0.25));
    userMoved.current = false;
    map.fitBounds(frame, { padding: PADDING, duration: reduced() ? 0 : 650, maxZoom: MAX_ZOOM, essential: true });
  }, [frame, loaded]);

  // ─── Hover sincronizado (lista ↔ mapa) ─────────────────────────────────────
  const { hovered } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const source = level === "mpio" ? "mpios" : "dptos";
    const prev = hoverApplied.current;
    if (prev && (prev.id !== hovered || prev.source !== source)) {
      try {
        if (map.getSource(prev.source)) map.setFeatureState(prev, { hover: false });
      } catch {
        /* fuente recreada */
      }
      hoverApplied.current = null;
    }
    if (hovered && map.getSource(source) && !hoverApplied.current) {
      map.setFeatureState({ source, id: hovered }, { hover: true });
      hoverApplied.current = { source, id: hovered };
    }
  }, [hovered, level, styleTick]);

  const zoom = (dir: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    userMoved.current = true;
    if (dir > 0) map.zoomIn({ duration: reduced() ? 0 : 300 });
    else map.zoomOut({ duration: reduced() ? 0 : 300 });
  };
  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    userMoved.current = false;
    map.fitBounds(live.current.frame, { padding: PADDING, duration: reduced() ? 0 : 650, maxZoom: MAX_ZOOM, essential: true });
  };

  const ctl =
    "grid size-8 place-items-center text-text-2 transition hover:bg-surface-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary";
  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl border border-border bg-surface-2", className)} style={style} data-map-canvas>
      {/* h-full (no absolute): mapbox fuerza position:relative en su contenedor */}
      <div ref={containerRef} className="h-full w-full" role="region" aria-label={ariaLabel} aria-describedby={ariaDescription ? descId : undefined} />
      {ariaDescription && (
        <p id={descId} className="sr-only">
          {ariaDescription}
        </p>
      )}
      <CanvasSkeleton hidden={painted} />
      {/* Controles: zoom + Restablecer arriba a la derecha */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
          <button type="button" className={ctl} onClick={() => zoom(1)} aria-label="Acercar">
            <Plus className="size-4" aria-hidden />
          </button>
          <span className="h-px bg-border" aria-hidden />
          <button type="button" className={ctl} onClick={() => zoom(-1)} aria-label="Alejar">
            <Minus className="size-4" aria-hidden />
          </button>
        </div>
        <button type="button" className={cn(ctl, "rounded-xl border border-border bg-surface shadow-card")} onClick={resetView} aria-label="Restablecer vista" title="Restablecer vista">
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
      {children}
      <ChartTooltip state={tip} />
    </div>
  );
}

/**
 * Silueta de Colombia mientras carga el lienzo (mapRedesign 12). Tapa también los controles y el
 * recuadro de San Andrés (z 15 < error z 20) y se retira con un fundido de 200 ms.
 */
export function CanvasSkeleton({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className={cn(
        "skeleton absolute inset-0 z-[15] rounded-none transition-opacity duration-200 motion-reduce:transition-none",
        hidden && "pointer-events-none opacity-0",
      )}
      aria-hidden
    >
      {/* Mismo encuadre que tendrá el mapa (padding de fitBounds): la silueta se convierte en la coropleta */}
      <svg viewBox={`0 0 ${CO_SILHOUETTE.width} ${CO_SILHOUETTE.height}`} className="absolute inset-x-4 bottom-3 top-5 h-[calc(100%-32px)] w-[calc(100%-32px)] opacity-70">
        <path d={CO_SILHOUETTE.d} fill="var(--surface)" stroke="var(--border)" strokeWidth={0.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Punto GeoJSON para etiquetas. */
export function labelPoint(at: [number, number], props: LabelProps): Feature<Point, LabelProps> {
  return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: at } };
}
