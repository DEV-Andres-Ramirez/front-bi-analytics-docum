"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsRight, Columns3, Download, FileText, Loader2, Rows3, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import { Popover } from "@/components/ui/popover";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import type { DetailResponse } from "@/dashboards/dto";
import type { ColumnDef, SectionDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { resolveStatus, statusDisplay, TONE_VARS } from "@/lib/charts/semantic";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { formatCOP, formatInt, formatValue } from "@/lib/format";
import { dayShort, displayLabel } from "@/lib/labels";
import { useDashboard } from "./dashboard-context";
import { SectionHeader } from "./section";

type Row = DetailResponse["rows"][number];
type Value = Row[string];

const isEmpty = (v: Value) => v === null || v === undefined || v === "";

/** Identificadores (radicados, códigos): sin espacios y con dígitos. No se re-capitalizan. */
const looksLikeCode = (s: string) => /\d/.test(s) && !/\s/.test(s);

/**
 * Valores crudos que displayLabel no normaliza por ser cortos o de tipo título:
 * "NO"/"SI" → "No"/"Sí" y neutrales ("Sin Clasificar", "NO REPORTA") en tipo oración.
 */
function tidyText(raw: string): string | null {
  const bare = raw.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (bare === "si") return "Sí";
  if (bare === "no") return "No";
  if (/^(sin|no)\s/.test(bare)) return statusDisplay(raw);
  return null;
}

/** Filas por carga en móvil ("Ver 10 más"); el servidor admite hasta 200 por página. */
const MOBILE_STEP = 10;
const MAX_PAGE = 200;
/**
 * Ancho mínimo de la tarjeta (no del viewport) para mostrar la tabla. Por debajo, tarjetas: entre 768 y
 * ≈ 1100 px de viewport, con el sidebar, la tarjeta mide 680–930 px y la tabla dejaba columnas clave
 * fuera de vista o bajo la columna fija.
 */
const TABLE_MIN_W = 900;

/**
 * Dónde se pinta la celda: "table" (una línea, con tope de ancho y elipsis), "card" (tarjeta móvil:
 * identificadores y badges en una línea, sin partirse) y "sheet" (ficha completa: todo el texto).
 */
type CellMode = "table" | "card" | "sheet";

/** Texto visible de un badge (código + etiqueta), para decidir su ancho en la tarjeta móvil. */
function badgeText(col: ColumnDef, value: string): string {
  const info = col.semantic ? resolveStatus(value, col.semantic) : null;
  return info ? `${info.code ? `${info.code} ` : ""}${info.display}` : statusDisplay(value);
}

// ─── Celdas ──────────────────────────────────────────────────────────────────
function StatusBadge({ col, value, mode }: { col: ColumnDef; value: string; mode: CellMode }) {
  const info = col.semantic ? resolveStatus(value, col.semantic) : null;
  // Tabla: una línea al ancho natural. Los estados sin código ("Solicitud de reclasificación") caben
  // hasta 240 px; los que llevan código de proceso (RADIAN "032 Recibo del bien…", hasta 310 px) se
  // recortan a 200 px porque el código ya los identifica. Tarjeta: una línea al ancho disponible (la
  // píldora nunca se parte en dos). Ficha: texto completo.
  const box =
    mode === "sheet" ? "whitespace-normal" : mode === "card" ? "max-w-full whitespace-nowrap" : cn("whitespace-nowrap", info?.code ? "max-w-[200px]" : "max-w-[240px]");
  const clip = mode !== "sheet" && "truncate";
  if (info?.tone) {
    const t = TONE_VARS[info.tone];
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", box)} style={{ background: t.soft, color: t.ink }} title={value}>
        <StatusIcon tone={info.tone} />
        {info.code && <span className="shrink-0 font-mono text-[11px] font-medium opacity-80">{info.code}</span>}
        <span className={cn("min-w-0", clip)}>{info.display}</span>
      </span>
    );
  }
  // Familia categórica (sin tono) o sin familia: chip neutral, con muestra de color si la hay
  const label = info ? info.display : statusDisplay(value);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-text-2", box)} title={value}>
      {info?.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: info.color }} />}
      {info?.code && <span className="shrink-0 font-mono text-[11px] font-medium">{info.code}</span>}
      <span className={cn("min-w-0", clip)}>{label}</span>
    </span>
  );
}

function LongText({ label, value }: { label: string; value: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-expanded={open}
        aria-label={`Ver ${label.toLowerCase()}`}
        title={value.length > 120 ? `${value.slice(0, 120)}…` : value}
        className="inline-grid size-7 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <FileText className="size-3.5" aria-hidden />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={380} label={label}>
        <div className="border-b border-border px-4 py-2.5 text-sm font-bold">{label}</div>
        <p className="max-h-72 overflow-y-auto whitespace-pre-line break-words px-4 py-3 text-[13px] leading-relaxed text-text-2" onClick={(e) => e.stopPropagation()}>
          {value}
        </p>
      </Popover>
    </>
  );
}

function Cell({ col, value, mode = "table" }: { col: ColumnDef; value: Value; mode?: CellMode }) {
  if (isEmpty(value)) return <span className="text-muted">—</span>;
  const full = mode !== "table";
  switch (col.format) {
    case "date":
      return <span className="tabular whitespace-nowrap">{formatDateTime(Number(value), false)}</span>;
    case "datetime":
      return <span className="tabular whitespace-nowrap">{formatDateTime(Number(value))}</span>;
    case "int":
      return <span className="tabular whitespace-nowrap">{formatInt(Number(value))}</span>;
    case "decimal":
      return <span className="tabular whitespace-nowrap">{formatValue(Number(value), "decimal")}</span>;
    case "days":
      return <span className="tabular whitespace-nowrap">{formatValue(Number(value), "days")}</span>;
    case "cop":
      return <span className="tabular whitespace-nowrap">{formatCOP(Number(value), false)}</span>;
    case "mono":
      // Un identificador partido no se lee ni se copia: en la tarjeta va en una línea (ocupa las dos
      // columnas si es largo, ver isWideCardField). Solo la ficha parte los muy largos (CUFE de 96).
      return (
        <span
          className={cn("font-mono text-[12px]", mode === "sheet" ? "break-all" : mode === "card" ? "block truncate whitespace-nowrap" : "block max-w-[180px] truncate")}
          title={String(value)}
        >
          {String(value)}
        </span>
      );
    case "badge":
      return <StatusBadge col={col} value={String(value)} mode={mode} />;
    case "long":
      return full ? <span className="whitespace-pre-line break-words">{String(value)}</span> : <LongText label={col.label} value={String(value)} />;
    default: {
      const raw = String(value);
      const day = dayShort(raw);
      if (day) return <span title={raw}>{day}</span>;
      const tidy = tidyText(raw);
      const d = looksLikeCode(raw) ? { short: raw, full: raw, secondary: undefined } : tidy ? { short: tidy, full: tidy, secondary: undefined } : displayLabel(raw, col.labelKind ?? "generic");
      const tip = d.secondary ? `${d.full} · ${d.secondary}` : d.full;
      if (full) {
        return (
          <span className="break-words">
            {d.full}
            {/* El dato secundario (NIT, sigla) va en su propia línea: no se parte "(NIT" / "927455112)" */}
            {d.secondary && <span className={cn("block whitespace-nowrap text-[11px] text-muted", /\d/.test(d.secondary) && "font-mono")}>{d.secondary}</span>}
          </span>
        );
      }
      // Tarjetas angostas (< 1000 px): tope de 200 px para que la tabla quepa sin esconder columnas clave
      return (
        <span className="block max-w-[200px] truncate @min-[1000px]:max-w-[240px]" title={tip !== d.short ? tip : raw.length > 32 ? raw : undefined}>
          {d.short}
        </span>
      );
    }
  }
}

/** Tarjeta móvil: identificadores largos (≥ 18 caracteres) y estados de más de 20 ocupan las dos columnas. */
function isWideCardField(col: ColumnDef, value: Value): boolean {
  if (isEmpty(value)) return false;
  const raw = String(value).trim();
  if (col.format === "mono") return raw.length >= 18;
  if (col.format === "badge") return badgeText(col, raw).length > 20;
  return false;
}

const RIGHT_ALIGNED = new Set(["int", "decimal", "days", "cop"]);

/** Columna mono redundante en la tarjeta móvil: repite el NIT que ya acompaña al nombre (labelKind "proveedor"). */
function isRedundantMono(col: ColumnDef, row: Row, cols: ColumnDef[]): boolean {
  if (col.format !== "mono") return false;
  const v = String(row[col.field] ?? "").trim();
  if (!v) return false;
  return cols.some((c) => {
    if (c.labelKind !== "proveedor" || isEmpty(row[c.field])) return false;
    const sec = displayLabel(String(row[c.field]), "proveedor").secondary;
    return Boolean(sec && sec.replace(/^NIT\s*/i, "") === v);
  });
}

// ─── Desbordamiento horizontal ───────────────────────────────────────────────
interface Overflow {
  left: boolean;
  right: boolean;
  /** Columnas (sin contar la fija) que no se ven completas a la derecha. */
  hiddenCols: number;
}
const NO_OVERFLOW: Overflow = { left: false, right: false, hiddenCols: 0 };

/**
 * Bordes con contenido oculto del contenedor con scroll y cuántas columnas quedan fuera a la
 * derecha (para el aviso "N columnas más"). Ref callback + ResizeObserver: compatible con el
 * React Compiler (sin lecturas de refs en render ni setState en efectos).
 */
function useTableOverflow() {
  const [state, setState] = useState<Overflow>(NO_OVERFLOW);
  const node = useRef<HTMLDivElement | null>(null);
  const measure = useCallback((el: HTMLDivElement) => {
    const limit = el.scrollLeft + el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = limit < el.scrollWidth - 1;
    let hiddenCols = 0;
    if (right) {
      const ths = [...el.querySelectorAll<HTMLElement>("thead th")];
      const pinned = ths.find((th) => th.dataset.pin === "right");
      const visibleEnd = limit - (pinned?.offsetWidth ?? 0);
      ths.forEach((th, i) => {
        if (i === 0 || th === pinned) return;
        if (th.offsetLeft + th.offsetWidth > visibleEnd + 2) hiddenCols += 1;
      });
    }
    setState((s) => (s.left === left && s.right === right && s.hiddenCols === hiddenCols ? s : { left, right, hiddenCols }));
  }, []);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      node.current = el;
      if (!el) return;
      measure(el);
      const ro = new ResizeObserver(() => measure(el));
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
      return () => {
        ro.disconnect();
        node.current = null;
        setState(NO_OVERFLOW);
      };
    },
    [measure],
  );
  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => measure(e.currentTarget), [measure]);
  const scrollRight = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: Math.max(240, el.clientWidth * 0.7), behavior: reduce ? "auto" : "smooth" });
  }, []);
  return { ref, onScroll, scrollRight, ...state };
}

// ─── Tabla ───────────────────────────────────────────────────────────────────
/**
 * DetailTable v2: SectionHeader compartido FUERA de la tarjeta (misma gramática y alineación que
 * las demás secciones); dentro, la toolbar (conteo, búsqueda, Columnas, Vista, CSV) con container
 * query. Primera columna fija con sombra al desplazar, fundido y aviso "N columnas más" en el borde
 * derecho mientras haya columnas fuera de vista, y la primera columna de valor (COP) fija a la
 * derecha (si es la última) para que la cifra principal siempre se vea. Badges por familia semántica, displayLabel en
 * celdas, formato long como ícono con popover y columnas sin datos en la página ocultas (quedan en
 * "Columnas" con la marca "sin datos"). Bajo 1000 px de tarjeta, celdas con menos aire y tope de texto de
 * 200 px. Tarjeta de menos de 900 px (teléfono, tablet o escritorio con sidebar abierto): tarjetas con la
 * cifra principal arriba a la derecha y "Ver 10 más" en lugar de la paginación; los códigos y estados
 * largos ocupan las dos columnas para no partirse. Paginación, orden y búsqueda en el servidor; CSV con ";" y BOM.
 */
export function DetailTable() {
  const { spec, meta, qs, data: dash } = useDashboard();
  const def = spec.table;
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState(def.defaultSort);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [row, setRow] = useState<Row | null>(null);
  const [dense, setDense] = useLocalStorage("docum:table-dense", false);
  const defaultHidden = useMemo(() => def.columns.filter((c) => c.visible === false).map((c) => c.field), [def.columns]);
  const [hidden, setHidden] = useLocalStorage<string[]>(`docum:cols:${spec.slug}`, defaultHidden);
  const colsAnchor = useRef<HTMLButtonElement>(null);
  const [colsOpen, setColsOpen] = useState(false);
  // Tarjetas o tabla según el ancho de la TARJETA (el sidebar cambia cuánto le queda). Antes de medir,
  // el viewport da la primera estimación (sin parpadeo en el teléfono)
  const narrowViewport = useMediaQuery("(max-width: 767px)");
  const { ref: cardRef, width: cardWidth, measured: cardMeasured } = useElementSize();
  const mobile = cardMeasured ? cardWidth < TABLE_MIN_W : narrowViewport;
  const { ref: scrollRef, onScroll: onScrollX, scrollRight, left: scrolledLeft, right: moreRight, hiddenCols } = useTableOverflow();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  // La página (y las filas cargadas en móvil) vuelven al inicio cuando cambian filtros, búsqueda u orden (sin efecto extra)
  const baseKey = `${qs}|${debouncedQ}|${sort.field}:${sort.dir}`;
  const pageKey = `${baseKey}|${size}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;
  const setPage = (fn: (p: number) => number) => setPageState({ key: pageKey, page: fn(page) });
  const [moreState, setMoreState] = useState({ key: baseKey, n: MOBILE_STEP });
  const mobileSize = moreState.key === baseKey ? moreState.n : MOBILE_STEP;
  const querySize = mobile ? mobileSize : size;
  const queryPage = mobile ? 1 : page;

  const params = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set("page", String(queryPage));
    p.set("size", String(querySize));
    p.set("sort", `${sort.field}:${sort.dir}`);
    if (debouncedQ) p.set("q", debouncedQ);
    return p.toString();
  }, [qs, queryPage, querySize, sort, debouncedQ]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["detalle", spec.slug, params],
    queryFn: async (): Promise<DetailResponse> => {
      const res = await fetch(`/api/tableros/${spec.slug}/detalle?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("detalle");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const visible = def.columns.filter((c) => !hidden.includes(c.field));
  const emptyCols = useMemo(() => {
    const rows = data?.rows ?? [];
    if (!rows.length) return new Set<string>();
    return new Set(def.columns.filter((c) => rows.every((r) => isEmpty(r[c.field]))).map((c) => c.field));
  }, [data, def.columns]);
  // Columnas sin datos en la página: no ocupan ancho (siguen en "Columnas" con la marca "sin datos").
  // La primera (identificador) nunca se oculta.
  const shownCols = visible.filter((c, i) => i === 0 || !emptyCols.has(c.field));
  const hiddenEmpty = visible.length - shownCols.length;
  // Cifra principal: la primera columna de valor (COP). En móvil va arriba a la derecha; en escritorio queda
  // fija a la derecha cuando es la última columna (si hay columnas después, manda el fundido del borde)
  const money = shownCols.slice(1).find((c) => c.format === "cop");
  const pinned = money && shownCols[shownCols.length - 1] === money ? money : undefined;
  // Tarjeta móvil: el primer estado (badge) va bajo el identificador
  const mobileBadge = shownCols.slice(1).find((c) => c.format === "badge");
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const csvHref = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set("format", "csv");
    p.set("sort", `${sort.field}:${sort.dir}`);
    if (debouncedQ) p.set("q", debouncedQ);
    return `/api/tableros/${spec.slug}/detalle?${p.toString()}`;
  }, [qs, sort, debouncedQ, spec.slug]);

  const toggleSort = (field: string) => setSort((s) => (s.field === field ? { field, dir: s.dir === "desc" ? "asc" : "desc" } : { field, dir: "desc" }));

  const unitSingular = spec.unit?.singular ?? "registro";
  const unitPlural = spec.unit?.plural ?? "registros";
  const header = useMemo<SectionDef>(() => ({ id: "detalle", nav: "Detalle", question: def.title, widgets: [] }), [def.title]);
  const stickyFade =
    "after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-[linear-gradient(to_right,rgb(20_23_28/0.10),transparent)] after:opacity-0 after:transition-opacity dark:after:bg-[linear-gradient(to_right,rgb(0_0_0/0.45),transparent)]";
  const pinShadow = moreRight && "shadow-[-8px_0_10px_-8px_rgb(20_23_28/0.22)] dark:shadow-[-8px_0_10px_-8px_rgb(0_0_0/0.6)]";

  // Móvil: "Ver 10 más"
  const loaded = data?.rows.length ?? 0;
  const canLoadMore = Boolean(data) && loaded < (data?.total ?? 0) && mobileSize < MAX_PAGE;
  const nextStep = Math.min(MOBILE_STEP, (data?.total ?? 0) - loaded, MAX_PAGE - mobileSize);

  return (
    <section id="detalle" aria-labelledby="s-detalle" className="dash-section">
      <SectionHeader section={header} index={spec.sections.length} />

      <div ref={cardRef} className="card @container overflow-hidden">
        {/* Toolbar: conteo + búsqueda + acciones. Bajo 1100 px de tarjeta la búsqueda y las acciones pasan a su propia fila */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-5 @min-[1100px]:flex-row @min-[1100px]:items-center @min-[1100px]:gap-4">
          <p className="min-w-0 text-sm text-muted @min-[1100px]:flex-1">
            {data ? (
              <>
                <strong className="tabular font-semibold text-text-2">{formatInt(data.total)}</strong> {data.total === 1 ? unitSingular : unitPlural} con los filtros actuales
              </>
            ) : (
              "Cargando registros…"
            )}
            {hiddenEmpty > 0 && !mobile && (
              <span>
                {" "}
                · {hiddenEmpty} {hiddenEmpty === 1 ? "columna sin datos oculta" : "columnas sin datos ocultas"}
              </span>
            )}
            {!mobile && <span> · clic en una fila para ver la ficha completa</span>}
            {/* Aviso de columnas fuera de vista (el botón desplaza la tabla) */}
            {!mobile && moreRight && hiddenCols > 0 && (
              <button
                type="button"
                onClick={scrollRight}
                className="ml-2 inline-flex h-6 translate-y-[-1px] items-center gap-1 whitespace-nowrap rounded-full bg-primary-soft-2 pl-2.5 pr-1.5 align-middle text-xs font-semibold text-primary-text transition-colors hover:bg-primary-soft"
              >
                {hiddenCols} {hiddenCols === 1 ? "columna más" : "columnas más"}
                <ChevronsRight className="size-3.5" aria-hidden />
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[180px] flex-1 basis-[200px] @min-[1100px]:w-64 @min-[1100px]:flex-none @min-[1100px]:basis-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en la tabla…"
                aria-label="Buscar en la tabla"
                className="h-10 w-full rounded-full border border-border bg-surface-2 pl-9 pr-8 text-sm outline-none focus:border-primary"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-3"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            {/* Acciones juntas: si no caben junto a la búsqueda bajan en bloque y quedan a la derecha */}
            <div className="ml-auto flex items-center gap-2">
              <button
                ref={colsAnchor}
                type="button"
                onClick={() => setColsOpen((o) => !o)}
                aria-expanded={colsOpen}
                aria-haspopup="dialog"
                className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text md:flex"
              >
                <Columns3 className="size-4" aria-hidden /> Columnas
                <span className="tabular text-xs font-medium text-muted">
                  {visible.length}/{def.columns.length}
                </span>
              </button>
              {/* La densidad solo aplica a la tabla */}
              {!mobile && (
                <button
                  type="button"
                  onClick={() => setDense(!dense)}
                  aria-pressed={dense}
                  className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text"
                >
                  <Rows3 className="size-4" aria-hidden /> {dense ? "Vista cómoda" : "Vista compacta"}
                </button>
              )}
              <a href={csvHref} className="btn-primary flex h-10 items-center gap-2 whitespace-nowrap px-4 text-sm" download aria-label="Descargar CSV">
                <Download className="size-4" aria-hidden />
                <span>
                  <span className="hidden sm:inline">Descargar </span>CSV
                </span>
              </a>
            </div>
          </div>
          <Popover anchor={colsAnchor} open={colsOpen} onClose={() => setColsOpen(false)} align="end" width={280} label="Columnas visibles">
            <div className="border-b border-border px-4 py-2.5 text-sm font-bold">Columnas visibles</div>
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {def.columns.map((c) => {
                const on = !hidden.includes(c.field);
                return (
                  <li key={c.field}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setHidden(on ? [...hidden, c.field] : hidden.filter((f) => f !== c.field))}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1">{c.label}</span>
                      {emptyCols.has(c.field) && <span className="text-[11px] text-muted">sin datos</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border p-2">
              <button type="button" onClick={() => setHidden(defaultHidden)} className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-3">
                Restablecer columnas
              </button>
            </div>
          </Popover>
        </div>

        <div className={cn("relative transition-opacity", isFetching && data && "opacity-60")} aria-busy={isFetching}>
          {isError && <EmptyState title="No fue posible cargar el detalle" />}
          {isLoading && !data && (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {data && data.rows.length === 0 && <EmptyState title="No hay registros para estos filtros" description="Ajusta el periodo o quita filtros para ver resultados." />}
          {data && data.rows.length > 0 && !mobile && (
            <>
              <div ref={scrollRef} onScroll={onScrollX} className="max-h-[640px] overflow-auto overscroll-x-contain">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      {shownCols.map((c, i) => {
                        const active = sort.field === c.field;
                        const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                        const empty = emptyCols.has(c.field);
                        const pin = c === pinned;
                        return (
                          <th
                            key={c.field}
                            scope="col"
                            data-pin={pin ? "right" : undefined}
                            aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                            className={cn(
                              "whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2.5 text-left align-bottom @min-[1000px]:px-4",
                              RIGHT_ALIGNED.has(c.format ?? "") && "text-right",
                              empty && "w-px",
                              i === 0 && cn("sticky left-0 z-10", stickyFade, scrolledLeft && "after:opacity-100"),
                              pin && cn("sticky right-0 z-10", pinShadow),
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(c.field)}
                              className={cn("inline-flex items-center gap-1.5 text-xs font-bold transition-colors", active ? "text-primary-text" : "text-text-2 hover:text-text")}
                            >
                              {c.label}
                              <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
                            </button>
                            {empty && <span className="block text-[10px] font-medium normal-case text-muted">sin datos</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, ri) => (
                      <tr
                        key={ri}
                        onClick={() => setRow(r)}
                        className="group cursor-pointer outline-none"
                        tabIndex={0}
                        aria-label={`Ver ficha del registro ${String(r[shownCols[0]?.field] ?? ri + 1)}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRow(r);
                          }
                        }}
                      >
                        {shownCols.map((c, i) => (
                          <td
                            key={c.field}
                            className={cn(
                              "border-b border-border px-3 text-text-2 transition-colors group-hover:bg-primary-soft group-focus-visible:bg-primary-soft @min-[1000px]:px-4",
                              dense ? "py-1.5" : "py-2.5",
                              RIGHT_ALIGNED.has(c.format ?? "") && "text-right",
                              emptyCols.has(c.field) && "w-px",
                              i === 0 &&
                                cn(
                                  "sticky left-0 z-[1] bg-surface font-semibold text-text group-focus-visible:shadow-[inset_3px_0_0_var(--primary)]",
                                  stickyFade,
                                  scrolledLeft && "after:opacity-100",
                                ),
                              c === pinned && cn("sticky right-0 z-[1] bg-surface font-semibold text-text", pinShadow),
                            )}
                          >
                            <Cell col={c} value={r[c.field]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Borde derecho: fundido mientras haya columnas fuera de vista (con columna fija, su sombra hace de aviso) */}
              {moreRight && !pinned && (
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-[linear-gradient(to_left,var(--surface),transparent)]" />
              )}
            </>
          )}
          {data && data.rows.length > 0 && mobile && (
            <ul className="divide-y divide-border">
              {data.rows.map((r, ri) => {
                const first = shownCols[0];
                if (!first) return null;
                const fields = shownCols
                  .slice(1)
                  .filter((c) => c.format !== "long" && c !== mobileBadge && c !== money && !isRedundantMono(c, r, shownCols))
                  .slice(0, 4);
                return (
                  <li key={ri}>
                    <button type="button" onClick={() => setRow(r)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-sm font-semibold text-text">
                          <Cell col={first} value={r[first.field]} mode="card" />
                        </span>
                        {money && !isEmpty(r[money.field]) && (
                          <span className="shrink-0 text-right">
                            <span className="sr-only">{money.label}: </span>
                            <span className="tabular block text-[15px] font-bold leading-tight text-text">
                              <Cell col={money} value={r[money.field]} />
                            </span>
                          </span>
                        )}
                      </span>
                      {mobileBadge && !isEmpty(r[mobileBadge.field]) && (
                        <span className="mt-1.5 flex">
                          <Cell col={mobileBadge} value={r[mobileBadge.field]} mode="card" />
                        </span>
                      )}
                      {fields.length > 0 && (
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs @min-[600px]:grid-cols-4">
                          {fields.map((c) => (
                            <div key={c.field} className={cn("min-w-0", isWideCardField(c, r[c.field]) && "col-span-2")}>
                              <dt className="text-muted">{c.label}</dt>
                              <dd className="min-w-0 break-words text-text-2">
                                <Cell col={c} value={r[c.field]} mode="card" />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {mobile ? (
          <footer className="flex flex-col items-stretch gap-2 border-t border-border px-4 py-3 text-sm">
            <span className="tabular text-center text-muted" aria-live="polite">
              {data && data.total > 0 ? `${formatInt(loaded)} de ${formatInt(data.total)} ${data.total === 1 ? unitSingular : unitPlural}` : "—"}
            </span>
            {canLoadMore && nextStep > 0 && (
              <button
                type="button"
                onClick={() => setMoreState({ key: baseKey, n: Math.min(MAX_PAGE, mobileSize + MOBILE_STEP) })}
                disabled={isFetching}
                className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
              >
                {isFetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Ver {nextStep} más
              </button>
            )}
            {data && loaded < data.total && mobileSize >= MAX_PAGE && (
              <p className="text-center text-xs text-muted">Usa la búsqueda o descarga el CSV para ver el resto.</p>
            )}
          </footer>
        ) : (
          <footer className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:px-5">
            <label className="flex items-center gap-2 text-muted">
              Filas por página
              <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-text outline-none focus:border-primary">
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              {isFetching && <Loader2 className="size-4 animate-spin text-muted" aria-label="Cargando" />}
              <span className="tabular text-muted" aria-live="polite">
                {data && data.total > 0
                  ? `${formatInt((data.page - 1) * data.size + 1)}–${formatInt(Math.min(data.page * data.size, data.total))} de ${formatInt(data.total)}`
                  : "—"}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Página anterior"
                  className="grid size-9 place-items-center rounded-full border border-border transition-colors hover:border-border-strong disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  aria-label="Página siguiente"
                  className="grid size-9 place-items-center rounded-full border border-border transition-colors hover:border-border-strong disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>

      <Sheet open={Boolean(row)} onClose={() => setRow(null)} title="Ficha del registro" description={meta.title} width="min(560px, 100vw)">
        {row && (
          <dl className="divide-y divide-border rounded-2xl border border-border">
            {def.columns.map((c) => (
              <div key={c.field} className="grid grid-cols-[minmax(120px,40%)_1fr] gap-3 px-4 py-2.5 text-sm">
                <dt className="font-semibold text-muted">{c.label}</dt>
                <dd className="min-w-0 break-words text-text">
                  <Cell col={c} value={row[c.field]} mode="sheet" />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {dash?.source === "mock" && <p className="mt-4 text-xs text-muted">Datos de prueba: los identificadores y nombres son ficticios.</p>}
      </Sheet>
    </section>
  );
}
