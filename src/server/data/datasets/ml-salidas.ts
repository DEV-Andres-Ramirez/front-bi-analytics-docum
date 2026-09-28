import "server-only";

import { DAY_MS } from "@/lib/dates";
import { orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import { fakeCompany, fakeDigits, fakeHex } from "../mock/fake";
import profile from "../mock/profiles/ml_salidas.json";
import type { DatasetDef } from "./types";

const ELECTRONICO = ["Correo electrónico certificado", "Correo electrónico"];
export const NOTIFICABLES = [
  "Acuse de recibo",
  "El destinatario abrio la notificacion",
  "No fue posible la entrega al destinatario",
];

export const mlSalidas: DatasetDef = {
  id: "ml_salidas",
  views: ["vw_reporte_datastudio_medicina_laboral_salidas"],
  schema: {
    NUMERO_RADICADO: "text",
    COPIA: "cat",
    FECHA_APROBACION: "date",
    FECHA_RADICACION: "date",
    FECHA_MAXIMA_RESPUESTA: "date",
    TRAMITE: "cat",
    OFICINA: "cat",
    ESTADO_SALIDA: "cat",
    PROCESO_ASISTENTE: "cat",
    SUBPROCESO: "cat",
    TIEMPO_DEFINIDO: "cat",
    TIEMPO_DEFINIDO_DIAS: "num",
    TIPO_EVENTO: "cat",
    DIAS_EN_APROBACION: "num",
    ESTADO_GUIA: "cat",
    FORMA_DE_ENVIO: "cat",
    EVENTO_CORREO_ELECTRONICO_CERTIFICADO: "cat",
    CUENTA_ENVIO_CORREO: "cat",
    PREFIJO: "cat",
    GESTIONADOR_RESPONSABLE: "cat",
    REVISOR: "cat",
    APROBADOR: "cat",
    DEPARTAMENTO_DESTINATARIO: "cat",
    MUNICIPIO_DESTINATARIO: "cat",
    DESTINATARIO: "text",
    NUMERO_GUIA_ENVIO: "text",
    ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO: "text",
    NOTIFICABLE: "cat",
    DENTRO_SLA: "cat",
  },
  geo: { dpto: "DEPARTAMENTO_DESTINATARIO", mpio: "MUNICIPIO_DESTINATARIO" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 1010,
    perDay: 40,
    overrides: {
      TRAMITE: { "Medicina laboral": 17122, "Comunicaciones ML": 6875 },
      OFICINA: {
        "6 GRUPO JUNTAS DE CALIFICACIÓN": 7900,
        "5 GRUPO JUNTAS DE CALIFICACIÓN": 5700,
        "6 GRUPO CENTRO DE EXCELENCIA": 4000,
        "5 GRUPO CENTRO DE EXCELENCIA": 3300,
        "GERENCIA MEDICA EXCELENCIA": 1700,
        "Mesa Back Medicina Laboral": 900,
        "Grupo JRC Automática": 330,
        "GERENCIA MEDICA JUNTAS": 170,
      },
      PROCESO_ASISTENTE: {
        "JUNTAS PCL": 7325, "JUNTAS ORIGEN": 6754, "ORIGEN AT": 4024, PRONUNCIAMIENTO: 2432, PCL: 1651,
        "INFORMATIVOS ML": 734, "HEREDADAS/TRASLADADAS": 539, "ORIGEN EL": 271, RECALIFICACION: 110,
        "REVISION PENSION": 108, MORTALES: 49,
      },
      TIEMPO_DEFINIDO: { "No Reporta": 28.6, "7": 26.4, "3": 21.6, "8": 6.6, "5": 6.3, "2": 4, "30": 3, "1": 2.5, "10": 1 },
      FORMA_DE_ENVIO: { "Correo electrónico certificado": 79.8, "Correo electrónico": 15, Mensajero: 3.2, Courier: 1.5, "No Reporta": 0.5 },
    },
    namePools: {
      GESTIONADOR_RESPONSABLE: { size: 16, skew: 0.7 },
      REVISOR: { size: 12, skew: 0.8 },
      APROBADOR: { size: 6, skew: 0.6 },
    },
    derive(row, ctx) {
      row.FECHA_APROBACION = ctx.date;
      row.NUMERO_RADICADO = radicado("SAL", ctx.date, 1_660_000 + ctx.index);
      row.FECHA_RADICACION = ctx.date;
      const td = Number(row.TIEMPO_DEFINIDO);
      row.TIEMPO_DEFINIDO_DIAS = Number.isFinite(td) ? td : null;
      row.FECHA_MAXIMA_RESPUESTA = Number.isFinite(td) ? ctx.date + td * DAY_MS : null;
      row.DIAS_EN_APROBACION = Number(ctx.weighted({ "0": 18, "1": 12, "2": 14, "3": 22, "4": 10, "5": 8, "6": 5, "7": 4, "10": 4, "15": 3 }));
      const electronico = ELECTRONICO.includes(String(row.FORMA_DE_ENVIO));
      if (electronico) {
        row.ESTADO_GUIA = "No Reporta";
        row.EVENTO_CORREO_ELECTRONICO_CERTIFICADO = ctx.weighted({
          "Acuse de recibo": 69, "El destinatario abrio la notificacion": 5, "No fue posible la entrega al destinatario": 3.5, "No Reporta": 22.5,
        });
        row.CUENTA_ENVIO_CORREO = row.FORMA_DE_ENVIO === "Correo electrónico" ? "notificacionesasis@positiva.gov.co" : "docu@positiva.gov.co";
        row.ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO = row.FORMA_DE_ENVIO === "Correo electrónico certificado" ? fakeHex(`sm-${ctx.index}`, 24) : "";
        row.NUMERO_GUIA_ENVIO = "";
      } else {
        row.EVENTO_CORREO_ELECTRONICO_CERTIFICADO = "No Reporta";
        row.ESTADO_GUIA = ctx.weighted({
          "Por enviar Mensajería": 42, "Por recibir en correspondencia": 32, "Enviado Courier": 9, "Por enviar Courier": 3, "ENTREGA EXITOSA": 14,
        });
        row.CUENTA_ENVIO_CORREO = "No Reporta";
        row.ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO = "";
        row.NUMERO_GUIA_ENVIO = `RA${fakeDigits(`g-${ctx.index}`, 9)}CO`;
      }
      row.DESTINATARIO = ctx.rng() < 0.6 ? fakeCompany(`ds-${ctx.index % 400}`) : "Afectado (persona natural)";
    },
  }),
  normalize: (r) => {
    const dias = Number(r.DIAS_EN_APROBACION);
    const def = Number(r.TIEMPO_DEFINIDO_DIAS);
    return {
      ...r,
      TIEMPO_DEFINIDO: orNoReporta(r.TIEMPO_DEFINIDO),
      ESTADO_GUIA: orNoReporta(r.ESTADO_GUIA),
      FORMA_DE_ENVIO: orNoReporta(r.FORMA_DE_ENVIO),
      EVENTO_CORREO_ELECTRONICO_CERTIFICADO: orNoReporta(r.EVENTO_CORREO_ELECTRONICO_CERTIFICADO),
      CUENTA_ENVIO_CORREO: orNoReporta(r.CUENTA_ENVIO_CORREO),
      DEPARTAMENTO_DESTINATARIO: orNoReporta(r.DEPARTAMENTO_DESTINATARIO),
      MUNICIPIO_DESTINATARIO: orNoReporta(r.MUNICIPIO_DESTINATARIO),
      NOTIFICABLE: NOTIFICABLES.includes(String(r.EVENTO_CORREO_ELECTRONICO_CERTIFICADO)) ? "Sí" : "No",
      // Provisional: aprobado dentro del tiempo definido para el trámite
      DENTRO_SLA: Number.isFinite(dias) && Number.isFinite(def) ? (dias <= def ? "Sí" : "No") : "Sin tiempo definido",
    };
  },
};
