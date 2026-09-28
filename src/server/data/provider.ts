import "server-only";

import type { DashboardResponse, DetailResponse, FiltersState } from "@/dashboards/dto";
import type { DashboardSpec } from "@/dashboards/types";
import { serverEnv } from "@/server/env";
import { runCsv, runDashboard, runDetail, type DetailQuery } from "./engine/run";
import { loadMockTable } from "./mock/load";

/**
 * Punto único de acceso a datos. La UI y los route handlers solo conocen esta
 * interfaz; cambiar de mock a BD real no toca componentes.
 */
export interface DataProvider {
  source: "mock" | "db";
  dashboard(spec: DashboardSpec, filters: FiltersState): Promise<DashboardResponse>;
  detail(spec: DashboardSpec, filters: FiltersState, query: DetailQuery): Promise<DetailResponse>;
  csv(spec: DashboardSpec, filters: FiltersState, query: Pick<DetailQuery, "sort" | "q">): Promise<string>;
}

const mockProvider: DataProvider = {
  source: "mock",
  async dashboard(spec, filters) {
    return runDashboard(loadMockTable(spec.dataset), spec, filters, "mock");
  },
  async detail(spec, filters, query) {
    return runDetail(loadMockTable(spec.dataset), spec, filters, query);
  },
  async csv(spec, filters, query) {
    return runCsv(loadMockTable(spec.dataset), spec, filters, query);
  },
};

const notImplemented = async (): Promise<never> => {
  throw new Error(
    "DATA_SOURCE=postgres aún no está implementado. Ver src/server/data/postgres/README.md para el plan de conexión.",
  );
};

const dbProvider: DataProvider = {
  source: "db",
  dashboard: notImplemented,
  detail: notImplemented,
  csv: notImplemented,
};

export function getProvider(): DataProvider {
  return serverEnv.dataSource === "postgres" ? dbProvider : mockProvider;
}
