"use client";

import { MapPinned } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { EmptyState } from "@/components/ui/primitives";
import type { TooltipContent } from "@/components/widgets/kit/chart-tooltip";
import { VizError } from "@/components/widgets/kit/viz-states";
import type { FilterOption, GeoValue, MapResult } from "@/dashboards/dto";
import type { MapWidget } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { useChartTheme, type ChartTheme } from "@/lib/charts/theme";
import { isNeutral } from "@/lib/charts/semantic";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { BOGOTA_ANCHOR, DPTO_BBOX, DPTO_LABEL, MAINLAND, SAN_ANDRES_CODE, type BBox, type LngLat } from "@/lib/geo/bounds";
import { useExporter } from "../frame-context";
import type { VizProps } from "../types";
import { classify, classLabel, colorByCode, panelTitle, rampColors, shortGeoName, unitOf } from "./classify";
import { composeMapPng } from "./export";
import { geometryBBox, loadBaseGeo, loadMunicipios, type BaseGeo, type MpioFC } from "./geo-data";
import { labelPoint, MapCanvas, TOKEN, type LabelFC, type MapCanvasApi, type MapPalette } from "./map-canvas";
import { MapLegend, MapNotes } from "./map-legend";
import { CoverageBanner, MapDetail, MapRanking, needsCoverageBanner, PanelHeader, PanelSummary, type BreakdownPart, type GeoRow } from "./map-panel";
import { MapSheet } from "./map-sheet";
import { SanAndresInset } from "./san-andres-inset";

/**
 * HeroMap (P1 de los 10 tableros con mapa · docs/ui-design-system.md "mapRedesign").
 * Composición en su propio contenedor:
 *  - ≥ 800 px internos: lienzo (máx. 600) + panel de insights (≥ 380) lado a lado, alto del tier;
 *    el ranking llena el alto que queda (filas enteras).
 *  - < 800 px: lienzo a ancho completo (tableta: alto ≈ ancho / 1,1, así Colombia pasa del 60 % del
 *    ancho; móvil: 420 a sangre) y panel debajo; el detalle se abre en una hoja inferior y los
 *    municipios con botón (sin doble clic).
 */

const SIDE_MIN = 800;
const MOBILE_MAX = 568;
const TOP_N = 10;
const LABELS_N = 5;
/** Tableta apilada: proporción ancho/alto del lienzo y límites del alto. */
const TABLET_ASPECT = 1.1;
const TABLET_H: [number, number] = [480, 680];
/** colorSystem D: en el mapa (se comparan todos los territorios) el desglose usa como máximo 3 slots. */
const BREAKDOWN_SLOTS = 3;
/** Marcador proporcional del territorio dominante: ≥ 30 % de lo ubicado sobre un polígono diminuto. */
const MARKER_SHARE = 0.3;
/** Área de la caja (grados²) bajo la cual el polígono mide menos de ≈ 400 px² en la vista nacional. */
const MARKER_MAX_AREA = 0.8;

/**
 * Enclave dominante → territorio que lo rodea. Con el círculo de Bogotá, el rótulo de Cundinamarca
 * (ancla interior al noroeste de Bogotá) chocaba con el del dominante y se iba al oeste, sobre Caldas
 * y Tolima. Se ancla a la latitud del círculo, corrido hacia su lóbulo noroeste, y MapCanvas lo pone
 * justo encima del círculo (`near` = radio): la cifra queda sobre Cundinamarca a cualquier ancho.
 */
const ENCLAVE_NEIGHBOR: Record<string, { code: string; at: LngLat }> = {
  "11": { code: "25", at: [-74.45, BOGOTA_ANCHOR[1]] },
};

const bboxArea = (b: BBox | undefined) => (b ? (b[2] - b[0]) * (b[3] - b[1]) : Infinity);

/**
 * Orden estable del desglose (el color sigue a la entidad, nunca a su puesto en cada territorio):
 * la suma de los top de todos los departamentos (el mapa ignora __dpto/__mpio, así que "Filtrar
 * tablero" no la mueve). Si el propio campo del desglose está filtrado, esa suma queda recortada y se
 * usan sus opciones facetadas (no cambian al filtrarlo). Solo los 3 primeros no neutrales reciben
 * slot; el resto va a "Otros".
 */
function breakdownSlots(options: FilterOption[] | undefined, ownFilter: boolean, dptos: GeoValue[]): string[] {
  const acc = new Map<string, number>();
  if (ownFilter && options?.length) for (const o of options) acc.set(o.value, o.count);
  else for (const d of dptos) for (const t of d.top ?? []) acc.set(t.label, (acc.get(t.label) ?? 0) + t.value);
  return [...acc]
    .filter(([label, n]) => n > 0 && !isNeutral(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, BREAKDOWN_SLOTS)
    .map(([label]) => label);
}

/**
 * Desglose de un territorio con colores estables: entidades con slot (por valor), neutrales en gris
 * con su nombre y "Otros" (lo que no tiene slot + lo que quedó fuera del top del servidor).
 */
function breakdownParts(row: GeoRow, slots: string[], theme: ChartTheme): BreakdownPart[] {
  const top = row.top ?? [];
  if (!top.length) return [];
  const slotted = top.filter((t) => slots.includes(t.label)).sort((a, b) => b.value - a.value);
  const neutral = top.filter((t) => isNeutral(t.label)).sort((a, b) => b.value - a.value);
  const parts: BreakdownPart[] = [
    ...slotted.map((t) => ({ label: t.label, value: t.value, color: theme.series[slots.indexOf(t.label)] ?? theme.other })),
    ...neutral.map((t) => ({ label: t.label, value: t.value, color: theme.other })),
  ];
  const rest = row.value - parts.reduce((s, p) => s + p.value, 0);
  if (rest > 0) parts.push({ label: "Otros", value: rest, color: theme.other });
  return parts;
}

function useMapPalette(): { theme: ChartTheme; palette: MapPalette; font: string; surface2: string; border: string } {
  const theme = useChartTheme();
  return useMemo(() => {
    const r = (v: string) => theme.resolve(`var(${v})`);
    return {
      theme,
      palette: {
        mode: theme.mode,
        surface: theme.surface,
        surface3: r("--surface-3"),
        text: theme.text,
        text2: r("--text-2"),
        primary: theme.primary,
        primaryStrong: r("--primary-strong"),
      },
      font: typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif",
      surface2: r("--surface-2"),
      border: r("--border"),
    };
  }, [theme]);
}

export function HeroMap({ widget, result, span }: VizProps<MapWidget, MapResult>) {
  const { spec, data, filters, toggleValue } = useDashboard();
  const colors = useMapPalette();
  const { palette, theme } = colors;
  const unit = unitOf(spec.unit);
  const { ref: rootRef, width, measured } = useElementSize<HTMLDivElement>();
  const side = measured ? width >= SIDE_MIN : span >= 12;
  // Teléfono: la tarjeta crece con el contenido (fila sin alto fijo) y el lienzo va a sangre
  const phone = useMediaQuery("(max-width: 599.98px)");
  const mobile = phone && measured && width < MOBILE_MAX;
  const widePanel = side && width - 620 >= 640;
  const stackCols = !side && width >= 640;

  // ─── Geografía ─────────────────────────────────────────────────────────────
  const [attempt, setAttempt] = useState(0);
  const [base, setBase] = useState<BaseGeo | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    loadBaseGeo()
      .then((g) => !off && setBase(g))
      .catch(() => !off && setFailure("No fue posible cargar la geografía de Colombia."));
    return () => {
      off = true;
    };
  }, [attempt]);

  const [drill, setDrill] = useState<string | null>(null);
  const [mpioGeo, setMpioGeo] = useState<{ code: string; fc: MpioFC } | null>(null);
  useEffect(() => {
    if (!drill) return;
    let off = false;
    loadMunicipios(drill)
      .then((fc) => !off && setMpioGeo({ code: drill, fc }))
      .catch(() => !off && setFailure("No fue posible cargar los municipios."));
    return () => {
      off = true;
    };
  }, [drill, attempt]);
  const level = drill ? "mpio" : "dpto";
  const mpios = drill && mpioGeo?.code === drill ? mpioGeo.fc : null;

  // ─── Estado de interacción ─────────────────────────────────────────────────
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [api, setApi] = useState<MapCanvasApi | null>(null);

  // ─── Datos por nivel ───────────────────────────────────────────────────────
  const ramp = useMemo(() => rampColors(theme.seq), [theme.seq]);
  const dptoCls = useMemo(() => classify(result.dptos.map((d) => d.value)), [result.dptos]);
  const fills = useMemo(() => colorByCode(result.dptos, dptoCls, ramp), [result.dptos, dptoCls, ramp]);
  const dptoValue = useMemo(() => new Map(result.dptos.map((d) => [d.code, d] as const)), [result.dptos]);
  const dptoNames = useMemo(() => new Map((base?.dptos.features ?? []).map((f) => [f.properties.code, f.properties.name] as const)), [base]);

  const mpioItems = useMemo(() => (drill ? result.mpios.filter((m) => m.code.startsWith(drill)) : []), [result.mpios, drill]);
  const mpioCls = useMemo(() => classify(mpioItems.map((m) => m.value)), [mpioItems]);
  const mpioFills = useMemo(() => colorByCode(mpioItems, mpioCls, ramp), [mpioItems, mpioCls, ramp]);
  const mpioNames = useMemo(() => new Map((mpios?.features ?? []).map((f) => [f.properties.code, f.properties.name] as const)), [mpios]);
  const mpioUniverse = useMemo(() => (mpios ? new Set(mpios.features.map((f) => f.properties.code)).size : null), [mpios]);

  const drillItem = drill ? dptoValue.get(drill) : undefined;
  const drillName = drill ? (drillItem?.name ?? dptoNames.get(drill) ?? drill) : undefined;
  const levelTotal = level === "dpto" ? result.total : (drillItem?.value ?? 0);
  const cls = level === "dpto" ? dptoCls : mpioCls;
  const levelFills = level === "dpto" ? fills : mpioFills;

  const rows: GeoRow[] = useMemo(() => {
    const src: GeoValue[] = level === "dpto" ? result.dptos : mpioItems;
    const denom = level === "dpto" ? result.total : levelTotal;
    return src
      .filter((d) => d.value > 0)
      .map((d) => ({
        code: d.code,
        name: d.name,
        value: d.value,
        pct: level === "dpto" ? d.share : denom ? d.value / denom : 0,
        color: levelFills[d.code] ?? palette.surface3,
        top: d.top,
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "es"));
  }, [level, result.dptos, result.total, mpioItems, levelTotal, levelFills, palette.surface3]);

  const zeros = useMemo(() => {
    const withData = new Set(rows.map((r) => r.code));
    const names = level === "dpto" ? dptoNames : mpioNames;
    return [...names.entries()]
      .filter(([code]) => !withData.has(code))
      .map(([, n]) => n)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [rows, level, dptoNames, mpioNames]);

  const located = level === "dpto" ? result.total - result.unlocated : mpioItems.reduce((s, m) => s + m.value, 0);
  const locTotal = level === "dpto" ? result.total : levelTotal;
  const universe = level === "dpto" ? (dptoNames.size || 33) : mpioUniverse;

  const filterField = level === "dpto" ? "__dpto" : "__mpio";
  const filtered = useMemo(() => filters.eq[filterField] ?? [], [filters.eq, filterField]);

  // ─── Etiquetas de valor (top 5 del nivel) ──────────────────────────────────
  // Territorio dominante sobre un polígono diminuto (Bogotá con el 78 %): círculo proporcional a su
  // participación en lo ubicado y rótulo más pesado; si no, el foco se lo robaban polígonos grandes
  const dominant = useMemo(() => {
    const top = rows[0];
    if (level !== "dpto" || !top || located <= 0 || top.code === SAN_ANDRES_CODE) return null;
    const share = top.value / located;
    if (share < MARKER_SHARE || bboxArea(DPTO_BBOX[top.code]) >= MARKER_MAX_AREA) return null;
    return { code: top.code, r: Math.round((6 + 16 * Math.sqrt(Math.min(1, share))) * 2) / 2 };
  }, [rows, level, located]);
  const labels: LabelFC = useMemo(() => {
    const near = dominant ? ENCLAVE_NEIGHBOR[dominant.code] : undefined;
    const anchor = (code: string): [number, number] | null => {
      if (near?.code === code) return near.at;
      if (level === "dpto") return code === SAN_ANDRES_CODE ? null : (DPTO_LABEL[code] ?? null);
      return mpios?.features.find((f) => f.properties.code === code)?.properties.l ?? null;
    };
    const top = rows
      .map((r) => ({ r, at: anchor(r.code) }))
      .filter((x): x is { r: GeoRow; at: [number, number] } => Boolean(x.at))
      .slice(0, LABELS_N);
    const nearRank = dominant && near ? top.findIndex((x) => x.r.code === near.code) : -1;
    const features = top.map(({ r, at }, i) =>
      labelPoint(at, {
        code: r.code,
        name: shortGeoName(r.name),
        value: formatInt(r.value),
        sk: -r.value,
        ...(dominant?.code === r.code ? { r: dominant.r, color: r.color } : dominant && near?.code === r.code ? { near: dominant.r } : {}),
        // Supera en valor al rótulo del vecino: en el lienzo de teléfono se coloca antes que él (MapCanvas)
        ...(nearRank >= 0 && i < nearRank && dominant?.code !== r.code ? { hi: true } : {}),
      }),
    );
    return { type: "FeatureCollection", features };
  }, [rows, level, mpios, dominant]);

  const frame: BBox = useMemo(() => {
    if (!drill) return MAINLAND;
    return DPTO_BBOX[drill] ?? MAINLAND;
  }, [drill]);

  // ─── Acciones ──────────────────────────────────────────────────────────────
  // (sin useCallback: el React Compiler memoiza; MapCanvas lee los manejadores desde una ref viva)
  const openDrill = (code: string) => {
    setDrill(code);
    setSelected(null);
    setHovered(null);
    setShowAll(false);
  };
  const back = () => {
    setDrill(null);
    setSelected(null);
    setHovered(null);
    setShowAll(false);
  };
  const select = (code: string | null) => setSelected(code);
  const clear = () => setSelected(null);

  const bboxOf = (code: string): BBox | null => {
    if (level === "dpto") return DPTO_BBOX[code] ?? null;
    const f = mpios?.features.filter((x) => x.properties.code === code) ?? [];
    if (!f.length) return null;
    return f.map((x) => geometryBBox(x.geometry)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  };
  const pick = (code: string) => {
    setSelected(code);
    const b = bboxOf(code);
    if (b && api) api.focus(b, level === "dpto" ? 6.8 : 9.5);
  };

  // ─── Desglose con color estable por entidad ────────────────────────────────
  const breakdownField = widget.breakdown?.field;
  const breakdownOptions = breakdownField ? data?.options[breakdownField] : undefined;
  const breakdownFiltered = Boolean(breakdownField && filters.eq[breakdownField]?.length);
  const slots = useMemo(() => breakdownSlots(breakdownOptions, breakdownFiltered, result.dptos), [breakdownOptions, breakdownFiltered, result.dptos]);

  // ─── Selección ─────────────────────────────────────────────────────────────
  const sel = useMemo(() => {
    if (!selected) return null;
    const idx = rows.findIndex((r) => r.code === selected);
    const name = (level === "dpto" ? dptoNames.get(selected) : mpioNames.get(selected)) ?? selected;
    const row: GeoRow = idx >= 0 ? rows[idx] : { code: selected, name, value: 0, pct: 0, color: palette.surface3 };
    return { row, rank: idx >= 0 ? idx + 1 : null, parts: breakdownParts(row, slots, theme) };
  }, [selected, rows, level, dptoNames, mpioNames, palette.surface3, theme, slots]);
  const detailRow = sel?.row ?? null;
  const scopeLabel = level === "dpto" ? "del total" : `de ${drillName}`;
  const announce = detailRow ? `Seleccionado: ${detailRow.name}, ${formatInt(detailRow.value)} ${detailRow.value === 1 ? unit.singular : unit.plural} (${formatPct(detailRow.pct)})` : "";

  // ─── Tooltip del lienzo ────────────────────────────────────────────────────
  const tooltipFor = (code: string, lvl: "dpto" | "mpio"): TooltipContent | null => {
    const row = rows.find((r) => r.code === code);
    const name = row?.name ?? (lvl === "dpto" ? (dptoValue.get(code)?.name ?? dptoNames.get(code)) : mpioNames.get(code)) ?? code;
    const hint = side && lvl === "dpto" ? "Clic: detalle · doble clic: municipios" : "Clic para ver el detalle";
    if (!row) return { title: name, value: "Sin registros", hint };
    const parts = breakdownParts(row, slots, theme);
    return {
      title: name,
      value: formatInt(row.value),
      valueNote: `${row.value === 1 ? unit.singular : unit.plural} · ${formatPct(row.pct)}`,
      rows: parts.map((t) => ({ label: displayLabel(t.label).full, value: formatInt(t.value), share: formatPct(t.value / (row.value || 1)), color: t.color })),
      hint,
    };
  };

  // ─── Leyenda ───────────────────────────────────────────────────────────────
  // La clase aislada del dominante lleva el nombre del territorio ("119 · Bogotá D.C.")
  const topName = rows[0] ? shortGeoName(rows[0].name) : null;
  const legendClasses = useMemo(
    () => cls.classes.map((c) => ({ color: ramp[c.ramp], label: c.dominant && topName ? `${classLabel(c)} · ${topName}` : classLabel(c) })),
    [cls, ramp, topName],
  );
  const { title, geo } = panelTitle(unit, widget.geoLabel, level);
  const legendTitle = `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} por ${level === "dpto" ? "departamento" : "municipio"}`;

  // ─── Exportación compuesta ─────────────────────────────────────────────────
  const exportTitle = level === "dpto" ? title : `${title} · ${drillName}`;
  const exportTop = useMemo(() => rows.slice(0, 5).map((r) => ({ name: r.name, value: formatInt(r.value), share: formatPct(r.pct), color: r.color })), [rows]);
  useExporter(async () => {
    const shot = api ? await api.snapshot() : null;
    return composeMapPng({
      title: exportTitle,
      subtitle: `${widget.title} · ${filters.from} a ${filters.to}`,
      map: shot,
      legendTitle,
      classes: legendClasses,
      noDataColor: palette.surface3,
      top: exportTop,
      footer: result.unlocated ? `${formatInt(result.unlocated)} sin ubicación válida (${formatPct(result.unlocated / (result.total || 1))})` : undefined,
      colors: { bg: palette.surface, text: palette.text, text2: palette.text2, muted: theme.muted, border: colors.border, surface2: colors.surface2 },
      fontFamily: colors.font,
    });
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && selected) {
      e.stopPropagation();
      setSelected(null);
    }
  };

  if (!TOKEN) {
    return <EmptyState title="Mapa no configurado" description="Define NEXT_PUBLIC_MAPBOX_TOKEN en .env.local para ver el mapa." icon={<MapPinned className="size-5" />} />;
  }

  const saValue = dptoValue.get(SAN_ANDRES_CODE)?.value ?? 0;
  const canDrill = level === "dpto";
  const detail = detailRow && (
    <MapDetail
      row={detailRow}
      level={level}
      rank={sel?.rank ?? null}
      of={rows.length}
      unit={unit}
      breakdownLabel={widget.breakdown?.label}
      parts={sel?.parts ?? []}
      isFiltered={filtered.includes(detailRow.code)}
      canDrill={canDrill}
      onFilter={() => toggleValue(filterField, detailRow.code)}
      onDrill={() => openDrill(detailRow.code)}
      onClear={clear}
      scopeLabel={scopeLabel}
      bare={!side}
    />
  );
  const summary = <PanelSummary level={level} withData={rows.length} universe={universe} top={rows[0] ?? null} located={located} total={locTotal} unit={unit} />;
  const showBanner = level === "dpto" && needsCoverageBanner(located, locTotal);
  const banner = showBanner ? <CoverageBanner located={located} total={locTotal} unit={unit} /> : null;
  const ranking = (
    <MapRanking
      rows={rows}
      zeros={zeros}
      level={level}
      // Lado a lado, el ranking llena el alto del panel (Top 12 a 1440) en lugar de cortar en 10 con un hueco
      limit={side ? rows.length : TOP_N}
      showAll={showAll}
      onToggleAll={() => setShowAll((s) => !s)}
      selected={selected}
      hovered={hovered}
      filtered={filtered}
      canDrill={canDrill}
      onHover={setHovered}
      onPick={pick}
      onDrill={openDrill}
      columns={widePanel ? 2 : 1}
      fit={side}
    />
  );
  // Apilado, el encabezado del panel ya nombra la métrica ("Tutelas por departamento"): la leyenda no lo repite
  const legend = <MapLegend title={legendTitle} hideTitle={!side} classes={legendClasses} method={cls.method} dark={palette.mode === "dark"} />;
  // Contexto del panel: la cifra de un KPI del tablero ("93 municipios cubiertos") o el texto declarado
  const ctxId = widget.vizOptions?.mapContextKpi;
  const ctxDef = ctxId ? spec.kpis.find((k) => k.id === ctxId) : undefined;
  const ctxValue = ctxId ? data?.kpis.find((k) => k.id === ctxId)?.value : undefined;
  const context = ctxDef && ctxValue !== null && ctxValue !== undefined ? `${formatValue(ctxValue, ctxDef.format)} ${ctxDef.label.toLocaleLowerCase("es-CO")}` : widget.vizOptions?.mapContext;
  // Con el banner de cobertura a la vista, la nota del widget sobre "sin ubicación" lo repetía (SMART 3)
  const notes = <MapNotes note={showBanner ? undefined : widget.note} context={context} />;
  // Tableta apilada: el lienzo usa todo el ancho de la tarjeta y su alto sigue al ancho (Colombia ≥ 60 % del ancho)
  const tabletHeight = Math.round(Math.min(TABLET_H[1], Math.max(TABLET_H[0], width / TABLET_ASPECT)));
  const canvasHeight = side ? undefined : mobile ? 420 : tabletHeight;

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className={cn("relative h-full min-h-0", !side && !mobile && "overflow-y-auto")} data-hero-map={side ? "side" : "stacked"}>
      <div
        className={cn("grid min-h-0", side ? "h-full gap-5" : "gap-4")}
        style={{ gridTemplateColumns: side ? `minmax(0, 600px) minmax(380px, 1fr)` : "minmax(0, 1fr)", gridTemplateRows: side ? "minmax(0, 1fr)" : undefined }}
      >
        <MapCanvas
          key={attempt}
          className={side ? "h-full min-h-0" : mobile ? "-mx-4 w-[calc(100%+32px)] rounded-none border-x-0" : "w-full"}
          style={canvasHeight ? { height: canvasHeight } : undefined}
          base={base}
          mpios={mpios}
          level={level}
          drill={drill}
          frame={frame}
          fills={fills}
          mpioFills={mpioFills}
          selected={selected}
          filtered={filtered}
          hovered={hovered}
          labels={labels}
          palette={palette}
          allowDrill={side}
          ariaLabel={`Mapa: ${title}`}
          ariaDescription={side && level === "dpto" ? "Clic en un territorio: detalle · doble clic: municipios. El ranking del panel permite recorrerlo con el teclado." : "Clic en un territorio: detalle."}
          tooltipFor={tooltipFor}
          onHover={setHovered}
          onSelect={select}
          onDrill={openDrill}
          onReady={setApi}
          onError={setFailure}
        >
          {level === "mpio" && (
            <button
              type="button"
              onClick={back}
              className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-semibold text-text shadow-card backdrop-blur transition hover:border-primary/40"
            >
              ← Colombia
            </button>
          )}
          {level === "dpto" && (
            <SanAndresInset
              color={fills[SAN_ANDRES_CODE] ?? palette.surface3}
              value={formatInt(saValue)}
              selected={selected === SAN_ANDRES_CODE}
              onSelect={() => select(SAN_ANDRES_CODE)}
              onHover={(on) => setHovered(on ? SAN_ANDRES_CODE : null)}
              label={`San Andrés, Providencia y Santa Catalina: ${saValue ? `${formatInt(saValue)} ${saValue === 1 ? unit.singular : unit.plural}` : "sin registros"}`}
            />
          )}
          {failure && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-surface/90">
              <VizError
                onRetry={() => {
                  setFailure(null);
                  setAttempt((a) => a + 1);
                }}
              />
            </div>
          )}
        </MapCanvas>

        <aside aria-label="Resumen del mapa" className={cn("flex min-h-0 min-w-0 flex-col", side ? "gap-3" : "gap-4")}>
          <PanelHeader title={title} geo={geo} level={level} dptoName={drillName} onBack={back} compact={side} />
          {side ? (
            <>
              {/* Sin scroll de panel: cifras arriba, ranking con el alto restante (filas enteras y
                  "Ver los N" visible) y pie fijo con detalle, leyenda y notas */}
              <div className="flex shrink-0 flex-col gap-3">
                {summary}
                {banner}
              </div>
              {ranking}
              <div className="flex shrink-0 flex-col gap-3">
                {detail}
                {legend}
                {notes}
              </div>
            </>
          ) : (
            <div className={cn("grid gap-4", stackCols && "grid-cols-2 gap-x-5")}>
              <div className="flex min-w-0 flex-col gap-4">
                {summary}
                {banner}
                {legend}
                {notes}
              </div>
              {ranking}
            </div>
          )}
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {!side && (
        <MapSheet open={Boolean(detailRow)} onClose={clear} title={level === "dpto" ? "Detalle del departamento" : "Detalle del municipio"}>
          {detail}
        </MapSheet>
      )}
    </div>
  );
}
