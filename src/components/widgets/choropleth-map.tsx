"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import { ArrowLeft, Filter, Layers, MapPinned, X } from "lucide-react";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { EmptyState } from "@/components/ui/primitives";
import type { GeoValue, MapResult } from "@/dashboards/dto";
import type { MapWidget } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { useExporter } from "./frame-context";

type BBox = [number, number, number, number];
interface GeoFC {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: { code: string; name: string }; geometry: { coordinates: unknown } }[];
}

const COLOMBIA: BBox = [-79.2, -4.4, -66.8, 12.7];
/** El mapa base es claro en ambos temas: se usa siempre la rampa secuencial clara. */
const RAMP = ["#fff4e6", "#ffdcb0", "#fbbd72", "#f39a33", "#df7702", "#b35a00", "#7a3b00"];

function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = parseInt(RAMP[i].slice(1), 16);
  const b = parseInt(RAMP[i + 1].slice(1), 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, "0")).join("")}`;
}

/** Escala logarítmica: evita que un territorio dominante (Bogotá) apague al resto. */
const logScale = (v: number, max: number) => (max <= 1 ? 1 : Math.log1p(v) / Math.log1p(max));
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11";

function bboxOf(geometry: { coordinates: unknown }): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);
  return [w, s, e, n];
}

interface Hover {
  x: number;
  y: number;
  item: GeoValue | { code: string; name: string; value: 0; share: 0; top?: undefined };
}

export function ChoroplethMap({ widget, result, height }: { widget: MapWidget; result: MapResult; height: number }) {
  const theme = useChartTheme();
  const { toggleValue, filters } = useDashboard();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const bboxes = useRef<Record<string, BBox>>({});
  const nameCache = useRef<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState<"dpto" | "mpio">("dpto");
  const [dpto, setDpto] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [selected, setSelected] = useState<{ level: "dpto" | "mpio"; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dptoValues = useMemo(() => Object.fromEntries(result.dptos.map((d) => [d.code, d])), [result.dptos]);
  const mpioValues = useMemo(() => Object.fromEntries(result.mpios.map((m) => [m.code, m])), [result.mpios]);
  const mpiosInDpto = useMemo(() => (dpto ? result.mpios.filter((m) => m.code.startsWith(dpto)) : []), [result.mpios, dpto]);

  // Refs con el estado más reciente para los manejadores de Mapbox
  const live = useRef({ dptoValues, mpioValues, level, dpto });
  useEffect(() => {
    live.current = { dptoValues, mpioValues, level, dpto };
  }, [dptoValues, mpioValues, level, dpto]);

  useExporter(useCallback(() => mapRef.current?.getCanvas().toDataURL("image/png") ?? null, []));

  // ─── Drill-down ────────────────────────────────────────────────────────────
  const drill = useCallback(async (code: string) => {
    const map = mapRef.current;
    if (!map) return;
    const bbox = bboxes.current[code];
    if (bbox) map.fitBounds(bbox, { padding: 36, duration: 900, essential: true });
    try {
      const res = await fetch(`/data/geo/municipios/${code}.json`);
      const fc = (await res.json()) as GeoFC;
      fc.features.forEach((f) => {
        bboxes.current[`m${f.properties.code}`] = bboxOf(f.geometry);
        nameCache.current[f.properties.code] = f.properties.name;
      });
      setNames({ ...nameCache.current });
      const src = map.getSource("mpios") as GeoJSONSource | undefined;
      if (src) src.setData(fc as unknown as FeatureCollection);
      else {
        map.addSource("mpios", { type: "geojson", data: fc as unknown as FeatureCollection, promoteId: "code" });
        map.addLayer({ id: "mpios-fill", type: "fill", source: "mpios", paint: { "fill-color": ["coalesce", ["feature-state", "color"], "rgba(0,0,0,0)"], "fill-opacity": 0.88 } });
        map.addLayer({
          id: "mpios-line",
          type: "line",
          source: "mpios",
          paint: {
            "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#14171c", "rgba(255,255,255,0.8)"],
            "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.6],
          },
        });
      }
      map.setLayoutProperty("mpios-fill", "visibility", "visible");
      map.setLayoutProperty("mpios-line", "visibility", "visible");
      map.setPaintProperty("dptos-fill", "fill-opacity", ["case", ["==", ["get", "code"], code], 0, 0.28]);
      setLevel("mpio");
      setDpto(code);
      setSelected(null);
      setHover(null);
    } catch {
      setError("No fue posible cargar los municipios.");
    }
  }, []);

  const back = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("mpios-fill")) {
      map.setLayoutProperty("mpios-fill", "visibility", "none");
      map.setLayoutProperty("mpios-line", "visibility", "none");
    }
    map.setPaintProperty("dptos-fill", "fill-opacity", 0.85);
    map.fitBounds(COLOMBIA, { padding: 16, duration: 800 });
    setLevel("dpto");
    setDpto(null);
    setSelected(null);
    setHover(null);
  }, []);

  // ─── Montaje del mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!TOKEN || !container.current) return;
    let disposed = false;
    let hovered: { source: string; id: string } | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (disposed || !container.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: container.current,
        style: STYLE,
        bounds: COLOMBIA,
        fitBoundsOptions: { padding: 16 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        doubleClickZoom: false,
        cooperativeGestures: true,
        preserveDrawingBuffer: true,
        projection: "mercator",
        locale: {
          "ScrollZoomBlocker.CtrlMessage": "Usa Ctrl + rueda del mouse para hacer zoom",
          "ScrollZoomBlocker.CmdMessage": "Usa ⌘ + rueda del mouse para hacer zoom",
          "TouchPanBlocker.Message": "Usa dos dedos para mover el mapa",
          "NavigationControl.ZoomIn": "Acercar",
          "NavigationControl.ZoomOut": "Alejar",
        },
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      ro = new ResizeObserver(() => map.resize());
      ro.observe(container.current);

      map.on("load", async () => {
        try {
          const fc = (await (await fetch("/data/geo/departamentos.json")).json()) as GeoFC;
          fc.features.forEach((f) => {
            bboxes.current[f.properties.code] = bboxOf(f.geometry);
            nameCache.current[f.properties.code] = f.properties.name;
          });
          if (!disposed) setNames({ ...nameCache.current });
          map.addSource("dptos", { type: "geojson", data: fc as unknown as FeatureCollection, promoteId: "code" });
          map.addLayer({ id: "dptos-fill", type: "fill", source: "dptos", paint: { "fill-color": ["coalesce", ["feature-state", "color"], "rgba(0,0,0,0)"], "fill-opacity": 0.85 } });
          map.addLayer({
            id: "dptos-line",
            type: "line",
            source: "dptos",
            paint: {
              "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#c05800", ["boolean", ["feature-state", "hover"], false], "#14171c", "rgba(255,255,255,0.9)"],
              "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, ["boolean", ["feature-state", "hover"], false], 2, 0.8],
            },
          });
          if (!disposed) setReady(true);
        } catch {
          setError("No fue posible cargar la geografía de Colombia.");
        }
      });

      const setHoverState = (next: { source: string; id: string } | null) => {
        if (hovered) map.setFeatureState(hovered, { hover: false });
        hovered = next;
        if (hovered) map.setFeatureState(hovered, { hover: true });
      };

      const onMove = (source: "dptos" | "mpios") => (e: MapMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const code = String(f.properties?.code ?? f.id);
        if (source === "dptos" && live.current.level === "mpio") return;
        map.getCanvas().style.cursor = "pointer";
        setHoverState({ source, id: code });
        const values = source === "dptos" ? live.current.dptoValues : live.current.mpioValues;
        const item = values[code] ?? { code, name: nameCache.current[code] ?? String(f.properties?.name ?? code), value: 0 as const, share: 0 as const };
        const box = map.getContainer();
        setHover({
          x: Math.max(8, Math.min(e.point.x + 14, box.clientWidth - 250)),
          y: Math.max(8, Math.min(e.point.y + 14, box.clientHeight - 160)),
          item,
        });
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        setHoverState(null);
        setHover(null);
      };

      map.on("mousemove", "dptos-fill", onMove("dptos"));
      map.on("mouseleave", "dptos-fill", onLeave);
      map.on("mousemove", "mpios-fill", onMove("mpios"));
      map.on("mouseleave", "mpios-fill", onLeave);

      map.on("click", (e) => {
        const layers = live.current.level === "mpio" ? ["mpios-fill"] : ["dptos-fill"];
        const f = map.queryRenderedFeatures(e.point, { layers: layers.filter((l) => map.getLayer(l)) })[0];
        if (clickTimer.current) clearTimeout(clickTimer.current);
        if (!f) {
          setSelected(null);
          return;
        }
        const code = String(f.properties?.code ?? f.id);
        clickTimer.current = setTimeout(() => setSelected({ level: live.current.level, code }), 240);
      });
      map.on("dblclick", (e) => {
        if (clickTimer.current) clearTimeout(clickTimer.current);
        if (live.current.level !== "dpto") return;
        const f = map.queryRenderedFeatures(e.point, { layers: ["dptos-fill"] })[0];
        if (f) void drill(String(f.properties?.code ?? f.id));
      });
    })().catch(() => setError("No fue posible inicializar el mapa."));

    return () => {
      disposed = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [drill]);

  // ─── Colorear según datos y tema ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    // La fuente puede no existir aún (p. ej. tras un remontaje por Fast Refresh)
    if (!map || !ready || !map.getSource("dptos")) return;
    const empty = theme.mode === "dark" ? "rgba(90,98,112,0.35)" : "rgba(180,184,191,0.35)";
    const maxD = Math.max(...result.dptos.map((d) => d.value), 1);
    for (const code of Object.keys(bboxes.current)) {
      if (code.startsWith("m")) continue;
      const v = dptoValues[code]?.value ?? 0;
      map.setFeatureState({ source: "dptos", id: code }, { color: v ? rampColor(0.08 + 0.92 * logScale(v, maxD)) : empty, selected: selected?.level === "dpto" && selected.code === code });
    }
    if (level === "mpio" && dpto && map.getSource("mpios")) {
      const maxM = Math.max(...mpiosInDpto.map((m) => m.value), 1);
      for (const key of Object.keys(bboxes.current)) {
        if (!key.startsWith(`m${dpto}`)) continue;
        const code = key.slice(1);
        const v = mpioValues[code]?.value ?? 0;
        map.setFeatureState({ source: "mpios", id: code }, { color: v ? rampColor(0.08 + 0.92 * logScale(v, maxM)) : empty });
      }
    }
  }, [ready, result, theme, level, dpto, dptoValues, mpioValues, mpiosInDpto, selected]);

  if (!TOKEN) {
    return <EmptyState title="Mapa no configurado" description="Define NEXT_PUBLIC_MAPBOX_TOKEN en .env.local para ver el mapa." icon={<MapPinned className="size-5" />} />;
  }

  const current = level === "mpio" ? mpiosInDpto : result.dptos;
  const maxCurrent = Math.max(...current.map((d) => d.value), 1);
  const sel: GeoValue | null = selected
    ? ((selected.level === "dpto" ? dptoValues[selected.code] : mpioValues[selected.code]) ?? { code: selected.code, name: names[selected.code] ?? selected.code, value: 0, share: 0 })
    : null;
  const geoField = selected?.level === "mpio" ? "__mpio" : "__dpto";
  const isFiltered = selected ? (filters.eq[geoField] ?? []).includes(selected.code) : false;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
        {/* h-full (no absolute): mapbox fuerza position:relative en su contenedor */}
        <div ref={container} className="h-full w-full" aria-label={`Mapa: ${widget.title}`} role="region" />
        {!ready && !error && <div className="skeleton absolute inset-0 rounded-none" />}
        {error && <div className="absolute inset-0 grid place-items-center bg-surface/80 text-sm text-critical-ink">{error}</div>}

        {/* Migas */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold shadow-card ring-1 ring-border backdrop-blur">
            <Layers className="size-3.5 text-primary" />
            {level === "dpto" ? "Colombia · departamentos" : `${names[dpto!] ?? dpto} · municipios`}
          </span>
          {level === "mpio" && (
            <button type="button" onClick={back} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-card">
              <ArrowLeft className="size-3.5" /> Colombia
            </button>
          )}
        </div>

        {/* Tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-60 rounded-xl bg-[#14171c]/95 p-3 text-xs text-white shadow-pop"
            style={{ left: hover.x, top: hover.y }}
          >
            <p className="text-sm font-bold">{hover.item.name}</p>
            <p className="mt-0.5 text-white/80">
              <span className="font-semibold text-white">{formatInt(hover.item.value)}</span> registros · {formatPct(hover.item.share)} del total
            </p>
            {hover.item.top && hover.item.top.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
                {hover.item.top.map((t) => (
                  <li key={t.label} className="flex justify-between gap-2">
                    <span className="truncate text-white/75">{t.label}</span>
                    <span className="tabular font-semibold">{formatInt(t.value)}</span>
                  </li>
                ))}
              </ul>
            )}
            {level === "dpto" && <p className="mt-2 text-[10px] text-white/55">Doble clic para ver municipios</p>}
          </div>
        )}

        {/* Panel de selección */}
        <AnimatePresence>
          {sel && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-3 right-3 z-10 w-[min(280px,calc(100%-24px))] rounded-2xl border border-border bg-surface/95 p-4 shadow-pop backdrop-blur"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{selected!.level === "dpto" ? "Departamento" : "Municipio"}</p>
                  <p className="text-base font-bold leading-tight">{sel.name}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar" className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-3">
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-2xl font-bold">{formatInt(sel.value)}</p>
              <p className="text-xs text-muted">{formatPct(sel.share)} del total · {widget.geoLabel}</p>
              {sel.top && sel.top.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {sel.top.map((t) => (
                    <li key={t.label} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-text-2">{t.label}</span>
                        <span className="tabular font-semibold">{formatInt(t.value)}</span>
                      </div>
                      <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${(t.value / (sel.value || 1)) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleValue(geoField, selected!.code)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", isFiltered ? "bg-surface-3 text-text" : "btn-primary")}
                >
                  <Filter className="size-3.5" /> {isFiltered ? "Quitar filtro" : "Filtrar tablero"}
                </button>
                {selected!.level === "dpto" && (
                  <button type="button" onClick={() => void drill(selected!.code)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-2 hover:border-primary/40">
                    <MapPinned className="size-3.5" /> Ver municipios
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leyenda */}
        <div className="absolute bottom-3 left-3 rounded-xl bg-surface/95 px-3 py-2 text-[11px] shadow-card ring-1 ring-border backdrop-blur">
          <p className="mb-1 font-semibold text-text-2">Registros por {level === "dpto" ? "departamento" : "municipio"}</p>
          <div className="flex items-center gap-2">
            <span className="tabular text-muted">1</span>
            <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP.slice(1).join(",")})` }} />
            <span className="tabular text-muted">{formatInt(maxCurrent)}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-faint">Escala logarítmica</p>
        </div>
      </div>

      {/* Ranking accesible */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="font-semibold text-text-2">Top {level === "dpto" ? "departamentos" : "municipios"}:</span>
        {current.slice(0, 5).map((d, i) => (
          <button
            key={d.code}
            type="button"
            onClick={() => setSelected({ level, code: d.code })}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 ring-1 ring-border transition hover:ring-primary/40"
          >
            <span className="font-bold text-primary-strong">{i + 1}</span> {d.name}
            <span className="tabular text-muted">{formatInt(d.value)}</span>
          </button>
        ))}
        {result.unlocated > 0 && (
          <span className="ml-auto text-muted">
            {formatInt(result.unlocated)} registros sin ubicación válida ({formatPct(result.unlocated / (result.total || 1))})
          </span>
        )}
      </div>
    </div>
  );
}
