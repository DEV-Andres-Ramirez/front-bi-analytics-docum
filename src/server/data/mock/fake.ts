import "server-only";

/** Identificadores y textos ficticios (determinísticos a partir de una llave). */

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CO_PREFIX = [
  "DISTRIBUIDORA", "CLÍNICA", "LABORATORIO", "DROGUERÍA", "SERVICIOS MÉDICOS", "IPS", "CENTRO MÉDICO",
  "TRANSPORTES", "SOLUCIONES", "COMERCIALIZADORA", "UNIÓN TEMPORAL", "FUNDACIÓN", "INVERSIONES", "GRUPO",
];
const CO_NAME = [
  "ANDINA", "DEL CARIBE", "LOS ALPES", "EL PORVENIR", "PACÍFICO SUR", "ORIENTE", "VITAL", "INTEGRAL",
  "LA ESPERANZA", "NUEVO HORIZONTE", "SAN MARCOS", "LAS PALMAS", "ALTO MAGDALENA", "LLANOS", "SIERRA NEVADA",
  "BUEN VIVIR", "ARCO IRIS", "PUENTE REAL", "CAMINO VERDE", "CUMBRE",
];
const CO_SUFFIX = ["S.A.S.", "S.A.", "LTDA.", "S.A.S. BIC"];
const P_FIRST = ["ANDREA", "CARLOS", "DIANA", "FELIPE", "LAURA", "JULIÁN", "NATALIA", "SANTIAGO", "CAMILA", "MATEO", "PAULA", "ANDRÉS"];
const P_LAST = ["ROJAS", "GÓMEZ", "MARTÍNEZ", "HERRERA", "CASTRO", "VARGAS", "MORENO", "JIMÉNEZ", "ORTIZ", "RINCÓN", "SALAZAR", "CÁRDENAS"];

export function fakeCompany(key: string): string {
  const h = hash(key);
  return `${CO_PREFIX[h % CO_PREFIX.length]} ${CO_NAME[(h >>> 5) % CO_NAME.length]} ${CO_SUFFIX[(h >>> 11) % CO_SUFFIX.length]}`;
}

export function fakePerson(key: string): string {
  const h = hash(key);
  return `${P_LAST[h % P_LAST.length]} ${P_LAST[(h >>> 4) % P_LAST.length]} ${P_FIRST[(h >>> 9) % P_FIRST.length]}`;
}

/** "[ 900123456 ] RAZÓN SOCIAL" como en las vistas de facturación. */
export function thirdPartyLabel(nit: string): string {
  if (!nit) return "";
  return `[ ${nit} ] ${nit.length >= 10 ? fakePerson(nit) : fakeCompany(nit)}`;
}

export function fakeHex(key: string, length: number): string {
  let out = "";
  let h = hash(key);
  while (out.length < length) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

export function fakeDigits(key: string, length: number): string {
  let out = "";
  let h = hash(key);
  while (out.length < length) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    out += String(h % 100000).padStart(5, "0");
  }
  return out.slice(0, length);
}

const OBS = [
  "Solicito información sobre el estado de mi trámite radicado anteriormente.",
  "Requiero certificado de afiliación actualizado para trámite laboral.",
  "Presento reclamo por demora en la autorización de servicios médicos.",
  "Solicito el reembolso de gastos de transporte para asistir a terapias.",
  "Adjunto documentos soporte para continuar con la calificación de origen.",
  "Solicito revisión del estado de cuenta de aportes de la empresa.",
  "Petición de copia del expediente y del dictamen de pérdida de capacidad laboral.",
  "Queja por la atención recibida en el punto de atención.",
  "Solicito programación de cita de valoración con especialista.",
  "Se da respuesta al requerimiento del ente de control dentro del término.",
];

export function fakeObservation(key: string): string {
  return `${OBS[hash(key) % OBS.length]} (texto de prueba)`;
}

const COURTS = ["CIVIL MUNICIPAL", "PENAL MUNICIPAL", "ADMINISTRATIVO", "LABORAL DEL CIRCUITO", "PROMISCUO MUNICIPAL", "DE FAMILIA"];
export function fakeCourt(key: string, city: string): string {
  const h = hash(key);
  return `JUZGADO ${String((h % 40) + 1).padStart(3, "0")} ${COURTS[(h >>> 6) % COURTS.length]} DE ${city || "BOGOTÁ"}`;
}
