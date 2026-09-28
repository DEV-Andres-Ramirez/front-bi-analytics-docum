import "server-only";

import { orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import { fakeCompany, fakeHex } from "../mock/fake";
import profile from "../mock/profiles/salidas_generales.json";
import type { DatasetDef } from "./types";

const ASUNTOS = [
  "Respuesta a derecho de petición",
  "Notificación de dictamen",
  "Respuesta a requerimiento de ente de control",
  "Comunicación de cumplimiento de fallo de tutela",
  "Envío de certificado de afiliación",
  "Respuesta a solicitud de reembolso",
];

export const salidasGenerales: DatasetDef = {
  id: "salidas_generales",
  views: ["vw_reporte_datastudio_salidas_generales"],
  schema: {
    Numero_radicado: "text",
    Radicado_entrada: "text",
    Copia: "cat",
    Fecha_radicacion: "date",
    Tramite: "cat",
    Cantidad_de_folios: "num",
    Anexos: "cat",
    Estado: "cat",
    Estado_guia: "cat",
    Medio_de_envio: "cat",
    Canal_de_envio: "cat",
    Tipo_documento_destinatario: "cat",
    Aprobador: "cat",
    Gestionador: "cat",
    Departamento_destinatario: "cat",
    Codigo_departamento_destinatario: "cat",
    Municipio_destinatario: "cat",
    Codigo_municipio_destinatario: "cat",
    Tiene_correo_destinatario: "cat",
    Tiene_id_sealmail: "cat",
    Destinatario: "text",
    Asunto: "text",
    ID_envio_sealmail: "text",
  },
  geo: { dpto: "Codigo_departamento_destinatario", mpio: "Codigo_municipio_destinatario" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 1212,
    perDay: 44,
    geoEmpty: 0.05,
    overrides: {
      Tramite: {
        PQRD: 56.7, "Medicina Laboral": 29.6, Tutela: 10, "Entes de control": 2, "Cuenta de cobro": 0.8,
        Correspondencia: 0.6, "Factura Administrativa": 0.3,
      },
      Estado: { Aprobado: 14431, Enviado: 1632, "Por recibir correspondencia": 242, "Entrega Exitosa": 8, Excluido: 3, "Para gestión": 3 },
      Medio_de_envio: { "Correo electrónico": 86.3, "Correo electrónico certificado": 12.8, Courier: 0.5, Mensajero: 0.2, Personal: 0.2 },
      Anexos: { NO: 70.6, SI: 29.3, "": 0.1 },
      Estado_guia: { "": 96.5, "Por recibir en correspondencia": 2, "Por enviar Courier": 0.9, DEVUELTO: 0.3, "ENVIO ANULADO": 0.3 },
      Tiene_correo_destinatario: { Sí: 89.4, No: 10.6 },
    },
    derive(row, ctx) {
      const prev = ctx.index > 0 && ctx.rng() < 0.11;
      row.Numero_radicado = radicado("SAL", ctx.date, 2_200_000 + (prev ? ctx.index - 1 : ctx.index));
      row.Radicado_entrada = radicado("ENT", ctx.date - 5 * 86_400_000, 1_440_000 + ctx.index);
      row.Fecha_radicacion = ctx.date;
      const medio = String(row.Medio_de_envio);
      row.Canal_de_envio =
        medio === "Correo electrónico" ? "Digital (Correo)" : medio === "Correo electrónico certificado" ? "Certificado (SealMail)" : "Sin canal";
      row.Tiene_id_sealmail = medio === "Correo electrónico certificado" ? "Sí" : "No";
      row.ID_envio_sealmail = row.Tiene_id_sealmail === "Sí" ? fakeHex(`sg-${ctx.index}`, 20) : "";
      row.Destinatario = ctx.rng() < 0.55 ? fakeCompany(`sgd-${ctx.index % 500}`) : "Persona natural (dato protegido)";
      row.Asunto = ctx.pick(ASUNTOS);
      if (ctx.rng() < 0.004) row.Cantidad_de_folios = 9999;
    },
  }),
  normalize: (r) => ({
    ...r,
    Copia: orNoReporta(r.Copia),
    Anexos: orNoReporta(r.Anexos),
    Estado_guia: orNoReporta(r.Estado_guia),
    Tipo_documento_destinatario: orNoReporta(r.Tipo_documento_destinatario),
    Aprobador: orNoReporta(r.Aprobador),
    Gestionador: orNoReporta(r.Gestionador),
    Departamento_destinatario: orNoReporta(r.Departamento_destinatario),
    Municipio_destinatario: orNoReporta(r.Municipio_destinatario),
  }),
};
