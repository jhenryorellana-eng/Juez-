import { NextResponse } from "next/server";
import { renderInformePdf } from "@/lib/informe-pdf";
import type { Informe } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vista previa del PDF con datos de muestra. SOLO en desarrollo. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "No disponible." }, { status: 404 });
  }

  const informe: Informe = {
    score: 62,
    level: "moderado",
    headline:
      "Caso con base sólida de persecución política, pero amenazado por inconsistencias de fechas y el tránsito por un tercer país.",
    summary:
      "Tras esta revisión, concluimos que su caso contiene elementos importantes que pueden servir como base para una solicitud de protección migratoria. Sin embargo, también identificamos debilidades legales y documentales que deben ser corregidas para fortalecer el expediente ante la Corte de Inmigración y, en caso de una decisión negativa, dejar una base más sólida para una posible apelación ante la BIA.",
    strengths: [],
    weaknesses: [],
    prepLevel: "B",
    prepFactors: [],
    matrix: [],
    crossExam: [],
    materia:
      "Asilo, Withholding of Removal y protección bajo la Convención contra la Tortura (CAT)",
    paisDetectado: "Venezuela",
    miedoCreible: {
      analisis:
        "El relato transmite un temor genuino, anclado en una detención real y verificable. Sin embargo, tal como está redactado hoy, un Oficial de Asilo percibiría un miedo descrito en términos generales: falta la dimensión personal (qué pensó, qué decidió, cómo cambió su vida diaria) que convierte un incidente en un temor creíble y continuo.",
      subjetivo:
        "El temor subjetivo se afirma pero no se muestra: conviene narrar las reacciones concretas (dejar de dormir en casa, cambiar rutas, cerrar redes sociales) con fechas y consecuencias.",
      objetivo:
        "La base objetiva es sólida si se anexa el informe de país del Departamento de Estado sobre detenciones arbitrarias del SEBIN, conectándolo con el perfil estudiantil del solicitante.",
      nexo:
        "El nexo con la opinión política existe pero debe formularse expresamente: la detención siguió a la marcha del 12 de febrero y los agentes mencionaron su liderazgo estudiantil.",
    },
    investigacionPais: {
      resumen:
        "Los solicitantes venezolanos han mantenido tasas de aprobación superiores al promedio en los tribunales de inmigración, especialmente en casos con teoría de opinión política documentada con evidencia de militancia y represalias estatales.",
      casos: [
        {
          referencia: "Asilo por opinión política (EOIR, FY2024)",
          resumen:
            "Casos ganados de líderes estudiantiles con detenciones documentadas: la clave fue la corroboración médica y el nexo explícito entre la actividad política y la represalia.",
        },
        {
          referencia: "Matter of Mogharrabi (BIA 1987)",
          resumen:
            "Precedente del estándar de temor fundado: basta una posibilidad razonable de persecución, no una certeza.",
        },
      ],
      fuentes: [
        "https://www.justice.gov/eoir/page/file/asylum-statistics",
        "https://www.state.gov/reports/2024-country-reports-on-human-rights-practices/venezuela/",
      ],
    },
    estadoActual:
      "El caso presenta una situación seria de amenazas, detención arbitraria y temor a daño físico por parte de agentes estatales (SEBIN) en Venezuela, en represalia por el liderazgo estudiantil del solicitante.\n\nEl punto más fuerte del expediente es el reporte médico que corrobora las lesiones sufridas durante la detención, junto con recortes de prensa que documentan el perfil político del solicitante. No obstante, el expediente necesita mayor desarrollo legal: las discrepancias de fechas entre la entrevista de miedo creíble y la declaración escrita podrían ser interpretadas por el juez como un problema de credibilidad bajo la ley REAL ID.",
    debilidades: [
      {
        titulo: "Inconsistencias de fechas entre la CFI y la declaración",
        detalle:
          "La declaración escrita indica que la detención ocurrió el 15 de marzo de 2023 y duró cinco días, mientras que en la entrevista de miedo creíble (credible fear interview) el solicitante declaró que ocurrió en junio de 2023 y duró tres días. Bajo INA § 208(b)(1)(B)(iii), el juez puede fundar una determinación adversa de credibilidad en inconsistencias de este tipo, aunque no vayan al núcleo del reclamo.",
        accion:
          "Obtener la transcripción de la CFI, construir una tabla de discrepancias y preparar una declaración complementaria que explique honestamente el origen de cada diferencia (trauma, interpretación, condiciones de la entrevista inicial).",
      },
      {
        titulo: "Tránsito de tres meses por Colombia",
        detalle:
          "La permanencia de tres meses en Colombia sin solicitar protección será usada por el abogado del DHS para argumentar reasentamiento firme (8 CFR § 208.15) o falta de temor subjetivo.",
        accion:
          "Documentar la temporalidad del tránsito: ausencia de estatus legal, imposibilidad de protección efectiva y la intención permanente de llegar a un lugar seguro.",
      },
    ],
    guiaDetalles: {
      introduccion:
        "Los jueces de inmigración no deciden por la gravedad general de la historia sino por su nivel de detalle y consistencia. Un relato específico, en orden cronológico y siempre igual en cada versión, es lo que la ley considera creíble.",
      ejemploVago: "Unos hombres me amenazaron cerca de mi casa y me dijeron que dejara de participar.",
      ejemploDetallado:
        "El [fecha] alrededor de las [hora aproximada], dos hombres bajaron de una camioneta [color y modelo] sin placas frente a mi casa en [barrio/calle]. El más alto, de unos [edad] años, con [rasgo: cicatriz, tatuaje, uniforme], me llamó por mi nombre y me dijo: '[palabras exactas que recuerde]'. Yo sentí [reacción] e hice [qué hizo inmediatamente después].",
      puntos: [
        {
          titulo: "La detención de marzo: el lugar",
          instruccion:
            "Describa la celda: tamaño, cuántas personas había, qué podía ver y oír, qué le decían los agentes y con qué palabras.",
        },
        {
          titulo: "Los agentes del SEBIN",
          instruccion:
            "Anote cuántos eran, edades aproximadas, uniformes o ropa, y cualquier nombre, apodo o rango que haya escuchado.",
        },
      ],
    },
    reforzamiento: [
      "Revisión completa del Formulario I-589.",
      "Revisión y ampliación de la declaración personal.",
      "Organización cronológica de los hechos y tabla de discrepancias.",
      "Desarrollo de la teoría legal de asilo (opinión política).",
      "Recomendaciones de evidencia adicional y de condiciones del país.",
      "Preparación de argumentos útiles para corte y para una posible apelación ante la BIA.",
    ],
    normas: [
      {
        ref: "INA § 208",
        texto: "Regula la elegibilidad para solicitar asilo en los Estados Unidos.",
      },
      {
        ref: "8 CFR § 1208.13",
        texto:
          "Establece los requisitos para demostrar elegibilidad, incluyendo persecución pasada o temor fundado de persecución futura.",
      },
      {
        ref: "Matter of Mogharrabi",
        texto: "Precedente clave sobre el estándar del temor fundado de persecución.",
      },
      {
        ref: "Matter of Acosta",
        texto: "Caso fundamental sobre la definición de grupo social particular.",
      },
    ],
    beneficios: [
      "Presentar una narrativa más clara y consistente.",
      "Explicar mejor el temor de regresar al país de origen.",
      "Conectar los hechos con una categoría legal protegida.",
      "Reducir las inconsistencias que amenazan la credibilidad.",
      "Preparar mejor al cliente para la audiencia individual.",
      "Fortalecer el récord para una posible apelación.",
    ],
    recomendacionFinal:
      "Sr. Vivanco: su caso tiene elementos importantes, especialmente el reporte médico y el perfil político documentado. Sin embargo, actualmente necesita reforzamiento, porque las inconsistencias de fechas identificadas pueden costarle la credibilidad ante el juez si no se explican de forma preparada y honesta.\n\nLa recomendación de USA Latino Prime es proceder con el reforzamiento del expediente antes de la siguiente etapa del proceso migratorio.",
    opcionRecomendada: "abogado",
    opcionJustificacion:
      "El caso presenta puntos legales delicados de credibilidad y requiere una estrategia más sólida, tanto para la corte como para una posible apelación ante la BIA.",
  };

  const pdf = await renderInformePdf(
    { nombre: "Juan José Vivanco Franco", email: "demo@example.com", pais: "Perú" },
    informe,
    "3 de julio de 2026",
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="informe-preview.pdf"',
    },
  });
}
