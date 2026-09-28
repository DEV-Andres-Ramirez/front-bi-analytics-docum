import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Geografía estática de public/data/geo (generada por scripts/geo/build-geo.mjs).
 * Caché por módulo: los 10 tableros con mapa comparten la descarga.
 */

export interface DptoProps {
  code: string;
  name: string;
}
export interface MpioProps {
  code: string;
  dpto: string;
  name: string;
  /** Punto de etiqueta interior [lon, lat]. */
  l?: [number, number];
}

export type DptoFC = FeatureCollection<Polygon | MultiPolygon, DptoProps>;
export type MpioFC = FeatureCollection<Polygon | MultiPolygon, MpioProps>;
export type ShapeFC = FeatureCollection<Polygon | MultiPolygon>;

export interface BaseGeo {
  dptos: DptoFC;
  mask: ShapeFC;
  outline: ShapeFC;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    // Un fallo no queda en caché: "Reintentar" vuelve a pedirlo
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function loadBaseGeo(): Promise<BaseGeo> {
  return Promise.all([load<DptoFC>("/data/geo/departamentos.json"), load<ShapeFC>("/data/geo/mask.json"), load<ShapeFC>("/data/geo/colombia-outline.json")]).then(
    ([dptos, mask, outline]) => ({ dptos, mask, outline }),
  );
}

export function loadMunicipios(dpto: string): Promise<MpioFC> {
  return load<MpioFC>(`/data/geo/municipios/${dpto}.json`);
}

/** Caja [o, s, e, n] de una geometría. */
export function geometryBBox(geometry: Polygon | MultiPolygon): [number, number, number, number] {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

/** Caja que envuelve varias geometrías (municipios de un departamento). */
export function collectionBBox(fc: FeatureCollection<Polygon | MultiPolygon>): [number, number, number, number] | null {
  if (!fc.features.length) return null;
  return fc.features.map((f) => geometryBBox(f.geometry)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
}
