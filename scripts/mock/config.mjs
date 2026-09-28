/**
 * Qué se extrae de cada CSV de top_secret/db para construir los perfiles mock.
 *
 *  - base:        fecha principal del registro → solo se usa para histogramas
 *                 de día de semana y hora (las fechas reales NO se guardan).
 *  - offsets:     otras fechas, guardadas como desfase en horas respecto a la base.
 *  - keep:        columnas NO personales que se muestrean juntas (bootstrap de
 *                 tuplas) para conservar las correlaciones (estado↔semáforo↔SLA…).
 *  - pseudo:      nombres de funcionarios → seudónimo ficticio determinístico.
 *  - pseudoNit:   NIT/cédulas → identificador ficticio determinístico.
 *  - independent: datos sensibles (sexo, condición especial…) → solo marginales,
 *                 muestreados de forma independiente para romper cualquier vínculo.
 *  - geo:         columnas geográficas muestreadas como tupla independiente.
 *  - geoFrom:     geografía embebida en un texto ("Colombia, BOGOTÁ, BOGOTÁ D.C.").
 *  - flags:       columna personal → solo "Sí"/"No" según tenga valor.
 *
 * Nunca se escriben nombres reales, documentos, correos, teléfonos, direcciones
 * ni textos libres en los perfiles.
 */
export const DATASETS = [
  {
    id: "facturas_recibidas",
    files: ["vw_reporte_datastudio_facturacion_factura_recibida.csv"],
    base: { field: "fecha", format: "iso", time: "hora" },
    keep: ["prefijo", "valor", "Hom_ultimo_Evento", "status_formato"],
    pseudoNit: ["proveedor"],
    numeric: ["valor"],
  },
  {
    id: "facturas_emitidas",
    files: ["vw_reporte_datastudio_facturacion_factura_manual.csv"],
    base: { field: "fecha_expedicion", format: "iso", time: "hora_expedicion" },
    offsets: { fecha_vencimiento: "iso" },
    keep: [
      "tipo_operacion", "nit_oferente", "prefijo_factura", "forma_pago", "medio_pago",
      "valor_bruto", "valor_impuestos", "valor_neto", "tipo_documento", "estado",
      "nro_resolucion", "fecha_inicio", "fecha_fin", "consecutivo_inicial", "consecutivo_final", "status_formato",
    ],
    pseudoNit: ["nit_adquiriente"],
    numeric: ["valor_bruto", "valor_impuestos", "valor_neto"],
  },
  {
    id: "pqrd",
    files: ["vw_reporte_datastudio_pqrd.csv"],
    base: { field: "fecha_de_radicado", format: "dmy2" },
    offsets: {
      fecha_maxima_de_respuesta: "dmy2",
      fecha_de_cierre: "dmy2",
      fecha_aprobacion: "dmy2",
      fecha_de_asignacion_al_gestionador: "dmy2",
    },
    keep: [
      "estado", "tipologia_de_pqrd", "detalle_del_tramite", "canal_de_radicacion", "acceso_informacion_publica",
      "producto", "nombre_tipo_solicitud", "oficina_responsable_de_respuesta", "tipo_firma", "categoria_gestionador",
      "favorabilidad_gestionador", "tiempo_por_vencer", "num_dias_asignacion_gestionador", "num_dias_revision",
      "num_dias_aprobacion", "num_dias_gestion_total", "Aux_Categoria", "cumplimiento_sla", "dias_ciclo_total",
      "dias_oficina_a_gestionador", "dias_gestion_a_aprobacion", "semaforo_riesgo", "oficina_responsable_agrupada",
      "resultado_favorabilidad", "rango_ciclo", "contactabilidad",
    ],
    pseudo: ["gestionador_responsable", "asignador_de_responsable", "responsable_aprobacion"],
    independent: ["sexo", "condicion_especial", "pertenece_a_la_comunidad_lgbtiq"],
    geo: ["departamento_del_remitente", "municipio_del_remitente"],
    numeric: [
      "num_dias_asignacion_gestionador", "num_dias_revision", "num_dias_aprobacion", "num_dias_gestion_total",
      "dias_ciclo_total", "dias_oficina_a_gestionador", "dias_gestion_a_aprobacion",
    ],
  },
  {
    id: "entes_control",
    files: ["vw_reporte_datastudio_entes_control.csv", "vw_Reporte_Entes_Control.csv"],
    dedupe: "Numero_de_Radicado",
    base: { field: "Fecha_de_Radicacion", format: "dmy4" },
    offsets: {
      Fecha_Maxima_de_Respuesta: "dmy4",
      Fecha_de_Aprobacion: "dmy4",
      Fecha_de_asignacion_a_la_oficina: "dmy4",
      Fecha_de_asignacion_al_gestionador: "dmy4",
    },
    keep: [
      "Estado", "Tipo_de_Requerimiento", "Canal_de_Radicacion", "Aux_Categoria", "ente_control", "marca_tramite",
      "Oficina_responsable_de_respuesta", "Tiempo_por_Vencer", "num_dias_asignacion_gestionador", "num_dias_aprobacion",
      "cumplimiento_sla", "dias_ciclo_total", "dias_oficina_a_gestionador", "dias_gestion_a_aprobacion",
      "semaforo_riesgo", "rango_ciclo",
    ],
    pseudo: ["Asignador_de_responsable", "Gestionador_Responsable", "Responsable_de_Aprobacion", "Responsable_de_Revision"],
    independent: ["Sexo_afectado"],
    geo: ["Departamento_Remitente", "Municipio_Remitente"],
    numeric: [
      "num_dias_asignacion_gestionador", "num_dias_aprobacion", "dias_ciclo_total",
      "dias_oficina_a_gestionador", "dias_gestion_a_aprobacion",
    ],
  },
  {
    id: "smart_m1",
    files: ["vw_reporte_datastudio_smart_momento1.csv"],
    base: { field: "fecha_registro_m1", format: "utc" },
    offsets: { fecha_radicacion_gestor: "utc" },
    keep: [
      "pqrd_estado", "pqrd_nombre_tipo_solicitud", "pqrd_semaforo_riesgo", "nombre_tipo_persona", "nombre_canal",
      "nombre_producto", "nombre_macro_motivo", "nombre_anexos_queja_reclamo", "nombre_tutela", "nombre_ente_control",
      "Aux_Categoria",
    ],
    independent: ["nombre_sexo", "nombre_condicion_especial"],
    geo: ["departamento", "municipio", "nombre_departamento", "nombre_municipio"],
  },
  {
    id: "smart_m2",
    files: ["vw_reporte_datastudio_smart_momento2.csv"],
    base: { field: "fecha_registro_m2", format: "utc" },
    offsets: { fecha_radicacion_gestor: "utc" },
    keep: [
      "caso_trasmitido_superfinanciera", "nombre_canal", "nombre_producto", "nombre_motivo", "nombre_tipo_persona",
      "nombre_punto_recepcion", "nombre_anexos_queja_reclamo", "nombre_ente_control",
      "nombre_tipo_identificacion_consumidor_financiero",
    ],
    geo: ["departamento", "municipio", "nombre_departamento", "nombre_municipio"],
  },
  {
    id: "smart_m3",
    files: ["vw_reporte_datastudio_smart_momento3.csv"],
    base: { field: "fecha_registro_m3", format: "utc" },
    offsets: { fecha_radicacion_gestor: "utc", fecha_aprobacion: "utc" },
    keep: [
      "pqrd_estado", "pqrd_tiempo_por_vencer", "pqrd_canal_radicacion", "pqrd_oficina_responsable", "pqrd_tipologia",
      "pqrd_nombre_tipo_solicitud", "pqrd_semaforo_riesgo", "pqrd_rango_ciclo", "pqrd_resultado_favorabilidad",
      "Alerta3", "Aux_Categoria", "momento", "tramite_radicacion", "nombre_canal", "nombre_producto", "nombre_motivo",
      "nombre_estado_queja_reclamo", "nombre_favorabilidad",
    ],
    independent: ["nombre_sexo", "nombre_condicion_especial"],
    geoFrom: { field: "geografia_consumidor_m1", separator: /,\s*|\s+-\s+/, columns: ["nombre_departamento", "nombre_municipio"] },
  },
  {
    id: "tutelas",
    files: ["vw_reporte_datastudio_tutelas.csv"],
    base: { field: "fecharadicacion", format: "utc" },
    offsets: { fecha_aprobacion: "utc" },
    keep: ["Etapa_procesal", "Dependencia", "Causal", "Tiempo_para_responder", "canal", "estado", "Estado_del_fallo", "Cerrado"],
    pseudo: ["Gestionador", "Asignador_de_Responsable"],
    geo: ["departamento", "municipio", "Departamento_remitente", "Municipio_del_remitente"],
  },
  {
    id: "ml_entradas",
    files: ["vw_reporte_datastudio_medicina_laboral_entradas.csv"],
    base: { field: "Fecha_de_radicacion", format: "iso" },
    offsets: { fecha_max_respuesta: "iso", fecha_aprobacion: "iso" },
    keep: [
      "tiempo_por_vencer", "canal_radicacion", "estado", "oficina_solicitud", "proceso_asistente", "subproceso",
      "formato_tiempo", "tiempo_definido", "tipo_tramite", "compromisos_proximos", "tiempo_en_gestion", "prefijo",
      "medio_envio", "estado_salida", "con_copia", "tipo_solicitud",
    ],
    pseudo: ["asignador_responsable", "gestionador_responsable", "responsable_aprobacion", "revisor", "radicador"],
    independent: ["genero_afectado"],
    geo: ["departamento_remitente", "municipio_remitente", "departamento_destinatario", "municipio_destinatario"],
  },
  {
    id: "ml_salidas",
    files: ["vw_reporte_datastudio_medicina_laboral_salidas.csv"],
    base: { field: "FECHA_APROBACION", format: "iso" },
    offsets: { FECHA_RADICACION: "iso" },
    keep: [
      "COPIA", "TRAMITE", "OFICINA", "TIPO_DOCUMENTO_DESTINATARIO", "ESTADO_SALIDA", "PROCESO_ASISTENTE", "SUBPROCESO",
      "FORMATO_TIEMPO", "TIEMPO_DEFINIDO", "TIPO_EVENTO", "DIAS_EN_APROBACION", "ESTADO_GUIA", "FORMA_DE_ENVIO",
      "EVENTO_CORREO_ELECTRONICO_CERTIFICADO", "CUENTA_ENVIO_CORREO", "PREFIJO",
    ],
    pseudo: ["GESTIONADOR_RESPONSABLE", "REVISOR", "APROBADOR"],
    geo: ["DEPARTAMENTO_DESTINATARIO", "MUNICIPIO_DESTINATARIO"],
    numeric: ["DIAS_EN_APROBACION"],
  },
  {
    id: "entradas_generales",
    files: ["vw_reporte_datastudio_entradas_generales.csv"],
    base: { field: "Fecha_radicacion", format: "iso" },
    keep: [
      "Oficina_asignada", "Tipo_de_tramite", "Estado", "Canal_radicacion", "Sucursal", "Punto_de_radicacion",
      "Anexos", "Medio_de_envio", "Estado_de_guia", "Tramite_inicial",
    ],
    geo: ["Departamento_remitente", "Municipio_remitente"],
  },
  {
    id: "salidas_generales",
    files: ["vw_reporte_datastudio_salidas_generales.csv"],
    base: { field: "Fecha_radicacion", format: "utc" },
    keep: ["Copia", "Tramite", "Cantidad_de_folios", "Anexos", "Estado", "Estado_guia", "Medio_de_envio", "Tipo_documento_destinatario"],
    pseudo: ["Aprobador", "Gestionador"],
    geo: ["Departamento_destinatario", "Codigo_departamento_destinatario", "Municipio_destinatario", "Codigo_municipio_destinatario"],
    flags: { Tiene_correo_destinatario: "Correo_del_destinatario", Tiene_id_sealmail: "ID_envio_sealmail" },
    numeric: ["Cantidad_de_folios"],
  },
];
