import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ClienteInfo, Informe } from "./types";

/** Paleta del documento (idéntica al informe modelo). */
const NAVY = "#012d6a";
const GOLD = "#b98d1e";
const INK = "#1f2a3d";
const MUTED = "#5a6675";
const ROW_BG = "#eef2f8";
const BOX_BG = "#fdf7e7";
const LINE = "#c9d3e0";

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 52,
    paddingBottom: 64,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    lineHeight: 1.5,
  },
  brand: {
    fontFamily: "Times-Bold",
    fontSize: 21,
    color: NAVY,
    textAlign: "center",
    letterSpacing: 4,
    lineHeight: 1,
    marginBottom: 6,
  },
  brandSub: {
    fontSize: 6.5,
    color: GOLD,
    textAlign: "center",
    letterSpacing: 2.2,
    lineHeight: 1,
    fontFamily: "Helvetica-Bold",
  },
  brandRule: {
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    marginTop: 10,
    marginBottom: 22,
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 15,
    color: NAVY,
    textAlign: "center",
    lineHeight: 1.3,
  },
  subtitle: {
    fontFamily: "Times-Italic",
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  infoRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  infoLabel: {
    width: 140,
    backgroundColor: ROW_BG,
    padding: 7,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    fontSize: 9.5,
  },
  infoValue: { flex: 1, padding: 7, fontSize: 9.5 },
  section: {
    fontFamily: "Times-Bold",
    fontSize: 12.5,
    color: NAVY,
    marginTop: 20,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1.4,
    borderBottomColor: GOLD,
  },
  p: { marginBottom: 8, textAlign: "justify" },
  sub: {
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    fontSize: 10.5,
    marginTop: 8,
    marginBottom: 4,
  },
  bulletRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 10 },
  bulletDot: { width: 12, color: NAVY },
  bulletText: { flex: 1, textAlign: "justify" },
  normaRef: { fontFamily: "Helvetica-Bold", color: NAVY },
  tHeadCell: {
    flex: 1,
    backgroundColor: NAVY,
    color: "#ffffff",
    padding: 8,
    textAlign: "center",
  },
  tCell: { flex: 1, padding: 8, textAlign: "center", fontSize: 9.5 },
  tLabel: {
    width: 95,
    backgroundColor: ROW_BG,
    padding: 8,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    fontSize: 9.5,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  box: {
    backgroundColor: BOX_BG,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    padding: 12,
    marginTop: 12,
  },
  boxLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: GOLD,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    left: 52,
    right: 52,
    bottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.8,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

function Bullet({ children }: { children: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function Paragraphs({ text }: { text: string }) {
  const parts = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  return (
    <>
      {parts.map((p, i) => (
        <Text key={i} style={s.p}>
          {p.trim()}
        </Text>
      ))}
    </>
  );
}

interface InformeDocProps {
  cliente: ClienteInfo;
  informe: Informe;
  fecha: string;
}

function InformeDoc({ cliente, informe, fecha }: InformeDocProps) {
  const pais = cliente.pais || informe.paisDetectado || "—";
  const esAbogado = informe.opcionRecomendada === "abogado";
  const opcionTitulo = esAbogado
    ? "Opción 2 — Reforzamiento con revisión de abogado (US $650)."
    : "Opción 1 — Reforzamiento por plataforma (US $400).";

  const infoRows: Array<[string, string]> = [
    ["Cliente", cliente.nombre],
    ["País de origen", pais],
    ["Materia", informe.materia],
    ["Preparado por", "USA Latino Prime"],
    ["Fecha del informe", fecha],
    ["Tiempo estimado de reforzamiento", "5 días hábiles"],
    ["Inversión", "US $400 (plataforma) · US $650 (con revisión de abogado)"],
  ];

  return (
    <Document
      title={`Informe de Evaluación — ${cliente.nombre}`}
      author="USA Latino Prime"
    >
      <Page size="LETTER" style={s.page}>
        {/* Membrete */}
        <Text style={s.brand}>USA LATINO PRIME</Text>
        <Text style={s.brandSub}>
          EVALUACIÓN Y REFORZAMIENTO DE EXPEDIENTES MIGRATORIOS
        </Text>
        <View style={s.brandRule} />

        <Text style={s.title}>
          INFORME DE EVALUACIÓN Y PROPUESTA DE REFORZAMIENTO
        </Text>
        <Text style={s.subtitle}>Caso de Asilo — {cliente.nombre}</Text>

        {/* Ficha del caso */}
        <View style={{ borderTopWidth: 1, borderTopColor: LINE }}>
          {infoRows.map(([label, value]) => (
            <View key={label} style={s.infoRow}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text style={s.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* I. Introducción */}
        <Text style={s.section}>I. INTRODUCCIÓN</Text>
        <Text style={s.p}>Estimado(a) {cliente.nombre}:</Text>
        <Text style={s.p}>
          USA Latino Prime ha realizado una revisión detallada de su expediente de
          asilo, incluyendo la documentación que usted nos proporcionó. Este informe
          resume el estado actual de su caso, las debilidades identificadas y la
          propuesta concreta de reforzamiento antes de la siguiente etapa de su
          proceso migratorio.
        </Text>
        <Paragraphs text={informe.summary} />

        {/* II. Estado actual */}
        <Text style={s.section}>II. ESTADO ACTUAL DEL CASO</Text>
        <Paragraphs text={informe.estadoActual} />

        {/* III. Miedo creíble */}
        {informe.miedoCreible.analisis.length > 0 && (
          <>
            <Text style={s.section}>
              III. ANÁLISIS DEL MIEDO CREÍBLE (CREDIBLE FEAR)
            </Text>
            <Paragraphs text={informe.miedoCreible.analisis} />
            <Text style={s.sub}>Temor subjetivo</Text>
            <Paragraphs text={informe.miedoCreible.subjetivo} />
            <Text style={s.sub}>Base objetiva</Text>
            <Paragraphs text={informe.miedoCreible.objetivo} />
            <Text style={s.sub}>Nexo con un motivo protegido</Text>
            <Paragraphs text={informe.miedoCreible.nexo} />
          </>
        )}

        {/* IV. Casos ganados del país */}
        {informe.investigacionPais.resumen.length > 0 && (
          <>
            <Text style={s.section}>
              IV. CASOS GANADOS Y PANORAMA DE {pais.toUpperCase()}
            </Text>
            <Paragraphs text={informe.investigacionPais.resumen} />
            {informe.investigacionPais.casos.map((c, i) => (
              <View key={i} wrap={false}>
                <Text style={s.sub}>{c.referencia}</Text>
                <Paragraphs text={c.resumen} />
              </View>
            ))}
            {informe.investigacionPais.fuentes.length > 0 && (
              <>
                <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>
                  Fuentes consultadas:
                </Text>
                {informe.investigacionPais.fuentes.map((f, i) => (
                  <Text key={i} style={{ fontSize: 7.5, color: MUTED, paddingLeft: 10 }}>
                    · {f}
                  </Text>
                ))}
              </>
            )}
          </>
        )}

        {/* V. Debilidades */}
        <Text style={s.section}>V. DEBILIDADES IDENTIFICADAS</Text>
        {informe.debilidades.map((d, i) => (
          <View key={i} wrap={false}>
            <Text style={s.sub}>
              {i + 1}. {d.titulo}
            </Text>
            <Paragraphs text={d.detalle} />
            <Text style={s.p}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                Estrategia recomendada:{" "}
              </Text>
              {d.accion}
            </Text>
          </View>
        ))}

        {/* VI. Guía de detalles */}
        {informe.guiaDetalles.introduccion.length > 0 && (
          <>
            <Text style={s.section}>
              VI. GUÍA DE DETALLES: LO QUE BUSCAN LOS JUECES DE INMIGRACIÓN
            </Text>
            <Paragraphs text={informe.guiaDetalles.introduccion} />
            <Text style={s.p}>
              Los adjudicadores evalúan la credibilidad por el nivel de detalle y la
              consistencia del relato: nombres, fechas, horas, lugares exactos,
              descripción de las personas (edad, estatura, ropa, cicatrices), colores y
              modelos de vehículos, las palabras que se dijeron y el orden cronológico
              de los hechos. Compare estos dos relatos de una misma escena:
            </Text>
            <View style={s.box} wrap={false}>
              <Text style={s.boxLabel}>RELATO VAGO (ASÍ NO)</Text>
              <Text style={{ fontFamily: "Times-Italic" }}>
                "{informe.guiaDetalles.ejemploVago}"
              </Text>
            </View>
            <View style={s.box} wrap={false}>
              <Text style={s.boxLabel}>
                CON EL DETALLE QUE BUSCA UN JUEZ (PLANTILLA — LLÉNELA CON SU VERDAD)
              </Text>
              <Text style={{ fontFamily: "Times-Italic" }}>
                "{informe.guiaDetalles.ejemploDetallado}"
              </Text>
            </View>
            <Text style={[s.p, { marginTop: 10 }]}>
              Puntos de su expediente donde agregar este nivel de detalle:
            </Text>
            {informe.guiaDetalles.puntos.map((p, i) => (
              <View key={i} wrap={false}>
                <Text style={s.sub}>
                  {i + 1}. {p.titulo}
                </Text>
                <Text style={[s.p, { paddingLeft: 10 }]}>{p.instruccion}</Text>
              </View>
            ))}
            <Text style={[s.p, { fontFamily: "Helvetica-Bold" }]}>
              Importante: estas son guías y estructuras — la historia y cada dato los
              pone usted, con su verdad. Nunca invente, exagere ni ajuste hechos: una
              solicitud frívola inhabilita casi todo beneficio migratorio
              (INA § 208(d)(6)). El detalle documenta lo que ya pasó, no lo reemplaza.
            </Text>
          </>
        )}

        {/* VII. Reforzamiento */}
        <Text style={s.section}>VII. REFORZAMIENTO RECOMENDADO</Text>
        <Text style={s.p}>
          USA Latino Prime recomienda realizar un reforzamiento integral del
          expediente. Este trabajo incluiría:
        </Text>
        {informe.reforzamiento.map((r, i) => (
          <Bullet key={i}>{r}</Bullet>
        ))}

        {/* VIII. Normas */}
        <Text style={s.section}>VIII. NORMAS LEGALES QUE SE PUEDEN INCORPORAR</Text>
        <Text style={s.p}>
          El reforzamiento permitirá introducir fundamentos legales como los
          siguientes:
        </Text>
        {informe.normas.map((n, i) => (
          <Text
            key={i}
            style={{ marginBottom: 6, paddingLeft: 10, textAlign: "justify" }}
          >
            <Text style={s.normaRef}>{n.ref}</Text> — {n.texto}
          </Text>
        ))}

        {/* IX. Beneficios */}
        <Text style={s.section}>IX. BENEFICIOS DE REFORZAR EL CASO</Text>
        <Text style={s.p}>El reforzamiento del expediente permitirá:</Text>
        {informe.beneficios.map((b, i) => (
          <Bullet key={i}>{b}</Bullet>
        ))}

        {/* X. Costos */}
        <Text style={s.section}>X. COSTOS Y TIEMPO DE ENTREGA</Text>
        <Text style={s.p}>
          USA Latino Prime ofrece dos modalidades de reforzamiento para su
          expediente:
        </Text>
        <View wrap={false} style={{ borderWidth: 1, borderColor: LINE }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={s.tLabel} />
            <View style={s.tHeadCell}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
                OPCIÓN 1
              </Text>
              <Text style={{ fontSize: 8 }}>Reforzamiento por plataforma</Text>
              {!esAbogado && (
                <Text style={{ fontSize: 7.5, color: "#ffd45e", marginTop: 2 }}>
                  • RECOMENDADA •
                </Text>
              )}
            </View>
            <View style={s.tHeadCell}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
                OPCIÓN 2
              </Text>
              <Text style={{ fontSize: 8 }}>Con revisión de abogado</Text>
              {esAbogado && (
                <Text style={{ fontSize: 7.5, color: "#ffd45e", marginTop: 2 }}>
                  • RECOMENDADA •
                </Text>
              )}
            </View>
          </View>
          <View style={s.tRow}>
            <Text style={s.tLabel}>Costo</Text>
            <Text style={[s.tCell, { fontFamily: "Helvetica-Bold" }]}>US $400</Text>
            <Text style={[s.tCell, { fontFamily: "Helvetica-Bold" }]}>US $650</Text>
          </View>
          <View style={s.tRow}>
            <Text style={s.tLabel}>Tiempo de entrega</Text>
            <Text style={s.tCell}>5 días hábiles</Text>
            <Text style={s.tCell}>5 días hábiles *</Text>
          </View>
          <View style={s.tRow}>
            <Text style={s.tLabel}>Alcance del servicio</Text>
            <Text style={[s.tCell, { textAlign: "left" }]}>
              Revisión del expediente, reforzamiento narrativo, estructura legal,
              recomendaciones de evidencia y preparación del informe de mejoras.
            </Text>
            <Text style={[s.tCell, { textAlign: "left" }]}>
              Todo lo incluido en la Opción 1, más revisión legal por abogado para
              verificar argumentos, normas aplicables y estructura del caso.
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>
          * Sujeto a disponibilidad del abogado revisor.
        </Text>

        {/* XI. Recomendación final */}
        <Text style={s.section}>XI. RECOMENDACIÓN FINAL</Text>
        <Paragraphs text={informe.recomendacionFinal} />

        <View style={s.box} wrap={false}>
          <Text style={s.boxLabel}>RECOMENDACIÓN DE USA LATINO PRIME</Text>
          <Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{opcionTitulo} </Text>
            {informe.opcionJustificacion}
          </Text>
        </View>

        <Text style={[s.p, { marginTop: 14 }]}>
          Quedamos a su disposición para iniciar el proceso de reforzamiento y
          atender cualquier consulta sobre este informe.
        </Text>
        <Text style={{ marginTop: 6 }}>Atentamente,</Text>
        <Text
          style={{
            fontFamily: "Times-Bold",
            fontSize: 13,
            color: NAVY,
            letterSpacing: 2,
            marginTop: 8,
          }}
        >
          USA LATINO PRIME
        </Text>
        <Text style={{ fontSize: 8.5, color: MUTED }}>
          Evaluación y Reforzamiento de Expedientes Migratorios
        </Text>
        <Text style={{ fontSize: 8.5, color: MUTED }}>
          Highland, Utah — Estados Unidos
        </Text>
        {/* Aviso legal final */}
        <View
          wrap={false}
          style={{
            marginTop: 16,
            borderWidth: 1,
            borderColor: LINE,
            backgroundColor: ROW_BG,
            padding: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 8.5,
              color: NAVY,
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            AVISO IMPORTANTE
          </Text>
          <Text style={{ fontSize: 8.5, color: INK, textAlign: "justify" }}>
            Este informe NO constituye asesoría legal ni recomendación jurídica, y no
            crea una relación abogado-cliente. Es únicamente información educativa y de
            preparación, elaborada a partir de los documentos proporcionados por el
            cliente y de información disponible en páginas oficiales del gobierno de los
            Estados Unidos (USCIS, Departamento de Justicia/EOIR y Departamento de
            Estado). Las leyes y criterios de inmigración cambian con frecuencia; los
            resultados de cada caso dependen del adjudicador, la jurisdicción y la
            evidencia. Para decisiones sobre su proceso, consulte a un abogado de
            inmigración licenciado o a un representante acreditado por el Departamento
            de Justicia. Informe preparado con apoyo de inteligencia artificial y el
            criterio metodológico de USA Latino Prime.
          </Text>
        </View>

        {/* Pie de página */}
        <View style={s.footer} fixed>
          <Text>
            USA Latino Prime · Documento confidencial preparado exclusivamente para
            el cliente
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Genera el PDF del informe y devuelve los bytes. */
export async function renderInformePdf(
  cliente: ClienteInfo,
  informe: Informe,
  fecha: string,
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <InformeDoc cliente={cliente} informe={informe} fecha={fecha} />,
  );
  return Buffer.from(buffer);
}
