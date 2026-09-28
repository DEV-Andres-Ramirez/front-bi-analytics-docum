import "server-only";

import { canal, orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import profile from "../mock/profiles/entradas_generales.json";
import type { DatasetDef } from "./types";

export const entradasGenerales: DatasetDef = {
  id: "entradas_generales",
  views: ["vw_reporte_datastudio_entradas_generales"],
  schema: {
    Numero_radicado: "text",
    Oficina_asignada: "cat",
    Tipo_de_tramite: "cat",
    Estado: "cat",
    Canal_radicacion: "cat",
    Sucursal: "cat",
    Punto_de_radicacion: "cat",
    Fecha_radicacion: "date",
    Departamento_remitente: "cat",
    Municipio_remitente: "cat",
    Usuario_gestion: "cat",
    Anexos: "cat",
    Radicador: "cat",
    Radicado_de_salida: "text",
    Medio_de_envio: "cat",
    Estado_de_guia: "cat",
    aprobador: "cat",
    Tramite_inicial: "cat",
  },
  geo: { dpto: "Departamento_remitente", mpio: "Municipio_remitente" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 1111,
    perDay: 44,
    geoEmpty: 0.03,
    overrides: {
      Tipo_de_tramite: {
        PQRD: 12900, "Medicina laboral": 7000, Tutela: 3600, "Entes control": 628, Correspondencia: 480,
        "Cuenta De Cobro": 15, "Factura administrativa": 3,
      },
      Estado: {
        Aprobado: 12700, "Para gestión": 5100, Cerrado: 2100, Enviado: 1600, "Por asignar": 1400, "Por aprobar": 765,
        "En edición": 279, "Por recibir correspondencia": 234, "Por revisar": 187, "Cerrado sin gestión": 171,
        "Solicitud de reclasificación": 74, "En asignación": 39, "Aprobación rechazada": 38, "Entrega Exitosa": 7,
      },
      Canal_radicacion: {
        Mail: 39.7, "Mail - AI": 21, Email: 15.9, WEB: 13.6, "Mail-IA": 3.8, Ventanilla: 3, "Contact Center": 1.6,
        "Defensor del consumidor": 0.4, "": 1,
      },
      Medio_de_envio: {
        "Correo electrónico": 9600, "Sin Definir": 9100, "Correo electrónico certificado": 5700, Mensajero: 200, "N/A": 18, Courier: 13,
      },
      Oficina_asignada: {
        "GRUPO PQRD MÉDICA": 4700, "GRUPO TUTELAS": 3600, "GRUPO PQRD INDEMNIZACIONES": 2000,
        "GERENCIA SUCURSAL COORDINADORA BOGOTÁ": 1900, "6 GRUPO JUNTAS DE CALIFICACIÓN": 1600, "GERENCIA MEDICA EXCELENCIA": 1500,
        "5 GRUPO CENTRO DE EXCELENCIA": 1400, "5 GRUPO JUNTAS DE CALIFICACIÓN": 1200, "GERENCIA DE RECAUDO Y CARTERA": 999,
        "6 GRUPO CENTRO DE EXCELENCIA": 848, "GRUPO ADMINISTRACIÓN DE PENSIONES": 540, "GERENCIA SUCURSAL COORDINADORA ANTIOQUIA": 384,
        "GERENCIA SUCURSAL COORDINADORA VALLE": 296, "GERENCIA SUCURSAL BOYACÁ": 282, "GERENCIA JURÍDICA": 266,
        "GERENCIA SUCURSAL NORTE DE SANTANDER": 224, "Grupo JRC Automática": 221, "GERENCIA DE AFILIACIONES Y NOVEDADES": 195,
        "GERENCIA SUCURSAL COORDINADORA ATLÁNTICO": 167, "GERENCIA SUCURSAL META": 150, "GERENCIA SUCURSAL TOLIMA": 140,
        "GERENCIA SUCURSAL RISARALDA": 130, "GERENCIA SUCURSAL QUINDÍO": 120, "GRUPO RECLAMACIONES VIDA": 110,
        "Mesa Back Medicina Laboral": 105, "GERENCIA SUCURSAL CESAR": 100, "GERENCIA SUCURSAL NARIÑO": 95,
        "GERENCIA SUCURSAL HUILA": 90, "GERENCIA SUCURSAL CAUCA": 85, "GERENCIA SUCURSAL SANTANDER": 80,
      },
      Estado_de_guia: { "": 90, "ENTREGA EXITOSA": 5, "Por recibir en correspondencia": 3, DEVUELTO: 2 },
    },
    namePools: {
      Usuario_gestion: { size: 28, skew: 0.8 },
      Radicador: { size: 18, skew: 0.9 },
      aprobador: { size: 12, skew: 0.8, emptyShare: 0.45 },
    },
    derive(row, ctx) {
      row.Numero_radicado = radicado("ENT", ctx.date, 2_000_000 + ctx.index);
      row.Fecha_radicacion = ctx.date;
      const conSalida = ["Aprobado", "Enviado", "Entrega Exitosa"].includes(String(row.Estado));
      row.Radicado_de_salida = conSalida && ctx.rng() < 0.7 ? radicado("SAL", ctx.date, 2_100_000 + ctx.index) : "";
    },
  }),
  normalize: (r) => ({
    ...r,
    Oficina_asignada: orNoReporta(r.Oficina_asignada),
    Tipo_de_tramite: orNoReporta(r.Tipo_de_tramite),
    Estado: orNoReporta(r.Estado),
    Canal_radicacion: canal(r.Canal_radicacion),
    Sucursal: orNoReporta(r.Sucursal),
    Punto_de_radicacion: orNoReporta(r.Punto_de_radicacion),
    Departamento_remitente: orNoReporta(r.Departamento_remitente),
    Municipio_remitente: orNoReporta(r.Municipio_remitente),
    Usuario_gestion: orNoReporta(r.Usuario_gestion),
    Radicador: orNoReporta(r.Radicador),
    Medio_de_envio: orNoReporta(r.Medio_de_envio),
    Estado_de_guia: orNoReporta(r.Estado_de_guia),
    aprobador: orNoReporta(r.aprobador),
  }),
};
