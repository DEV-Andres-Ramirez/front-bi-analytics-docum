import "server-only";

import { DAY_MS } from "@/lib/dates";
import { canal, diasPlazo, estadoFallo, orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import { fakeCourt, fakeDigits } from "../mock/fake";
import profile from "../mock/profiles/tutelas.json";
import type { DatasetDef } from "./types";

export const tutelas: DatasetDef = {
  id: "tutelas",
  views: ["vw_reporte_datastudio_tutelas"],
  schema: {
    Radicado: "text",
    fecharadicacion: "date",
    fecha_aprobacion: "date",
    Etapa_procesal: "cat",
    Dependencia: "cat",
    Causal: "cat",
    Tiempo_para_responder: "cat",
    canal: "cat",
    estado: "cat",
    Estado_del_fallo: "cat",
    Cerrado: "cat",
    Gestionador: "cat",
    Asignador_de_Responsable: "cat",
    departamento: "cat",
    municipio: "cat",
    Departamento_remitente: "cat",
    Municipio_del_remitente: "cat",
    Nombre_del_remitente: "text",
    Numero_de_radicado_juzgado: "text",
    dias_transcurridos: "num",
  },
  geo: { dpto: "departamento", mpio: "municipio" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 808,
    perDay: 30,
    overrides: {
      Cerrado: { "En trámite": 56.25, "En término": 32.56, "Fuera de término": 11.19 },
      estado: { Cerrado: 51.3, Enviado: 43.8, "Para gestión": 4.8, "Por aprobar": 0.6, "Aprobación rechazada": 0.4 },
    },
    derive(row, ctx) {
      row.Radicado = radicado("ENT", ctx.date, 1_300_000 + ctx.index);
      row.fecharadicacion = ctx.date;
      const city = String(row.Municipio_del_remitente || row.municipio || "BOGOTÁ");
      row.Nombre_del_remitente = fakeCourt(`tu-${ctx.index}`, city);
      row.Numero_de_radicado_juzgado = `${fakeDigits(`jz-${ctx.index}`, 12)}${new Date(ctx.date).getUTCFullYear()}${fakeDigits(`jz2-${ctx.index}`, 7)}`;
      row.dias_transcurridos = row.Cerrado === "En trámite" ? Math.max(0, Math.floor((ctx.now - ctx.date) / DAY_MS)) : null;
    },
  }),
  normalize: (r) => ({
    ...r,
    canal: canal(r.canal, true),
    Etapa_procesal: orNoReporta(r.Etapa_procesal),
    Dependencia: orNoReporta(r.Dependencia),
    Causal: orNoReporta(r.Causal),
    Estado_del_fallo: estadoFallo(r.Estado_del_fallo),
    Tiempo_para_responder: diasPlazo(r.Tiempo_para_responder),
    Gestionador: orNoReporta(r.Gestionador),
    Asignador_de_Responsable: orNoReporta(r.Asignador_de_Responsable),
    departamento: orNoReporta(r.departamento),
    municipio: orNoReporta(r.municipio),
    Departamento_remitente: orNoReporta(r.Departamento_remitente),
    Municipio_del_remitente: orNoReporta(r.Municipio_del_remitente),
  }),
};
