# El Juez — Evaluador de casos de inmigración con IA

Probador donde el usuario relata su historia de migración, una IA le hace preguntas
adaptadas a su caso, y un "Juez" (IA) evalúa la probabilidad de éxito.

## Decisiones (confirmadas con el usuario)
- Persistencia: **Sin login / stateless** (modo demo, sin base de datos).
- IA: **Google Gemini real** (key en `.env.local`, nunca hardcodeada). Fallback a modo demo si no hay key.
- Estilo: **Minimal premium / Apple-like** (limpio, tipografía grande, micro-animaciones, transiciones fluidas).

## Arquitectura de modelos (de la página de precios oficial)
- `gemini-3.5-flash`  → EL JUEZ (veredicto final, razonamiento legal). El más inteligente.
- `gemini-3.1-flash-lite` → generación de preguntas dinámicas de la entrevista (rápido y barato).

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS v3
- Framer Motion (transiciones), Zustand (estado del wizard), lucide-react (iconos)
- @google/genai (SDK oficial de Gemini), llamadas SOLO server-side (Route Handlers)

## Flujo (paso a paso, con transiciones)
1. Hero — entrada impactante + CTA + disclaimer.
2. Selección de tipo de caso: asilo político / reforzamiento / apelación BIA / cambio de corte.
3. Entrevista: preguntas tailored (IA) una a una + relato libre de la historia.
4. "El Juez analizando..." — loader creativo multi-fase.
5. Veredicto: probabilidad %, factores a favor/en contra, recomendaciones, próximos pasos.

## Tareas
- [x] Investigar modelos Gemini 3.x y elegir arquitectura
- [x] Confirmar decisiones de alcance con el usuario
- [x] Scaffolding (configs + deps: Next 16, React 19, Tailwind v3, framer-motion, zustand, @google/genai)
- [x] lib: types, constantes, prompts, cliente Gemini, demo, store
- [x] API: /api/interview/questions, /api/verdict (con fallback a modo demo)
- [x] UI: Hero, CaseType, Interview, Analyzing, Verdict + componentes
- [x] Estilos premium + animaciones
- [x] Build/typecheck verde
- [x] Smoke test de las rutas API (demo mode) — OK
- [x] README con instrucciones

## Estado: MVP COMPLETO Y PROBADO CON IA REAL ✅
- [x] Integrado `thinkingConfig` (Gemini 3.x): MEDIUM para el Juez (3.5-flash), MINIMAL para preguntas (3.1-flash-lite).
- [x] GEMINI_API_KEY configurada en .env.local (gitignored).
- [x] Probado de extremo a extremo con la API real:
      - Preguntas (3.1-flash-lite): 6 preguntas tailored de alta calidad (mencionan EOIR-26, debido proceso, INA).
      - Veredicto (3.5-flash): 85% en caso de asilo, análisis con Protocolo de Estambul, I-589,
        reasentamiento firme, nexo político. Calidad real de derecho migratorio.
- [x] Walkthrough completo en navegador (Playwright): Hero → Caso → Entrevista → Análisis → Veredicto, todo OK.
- [x] Añadido app/icon.svg (favicon de marca, silencia el 404).

## Recordatorio de seguridad
- La API key se compartió por chat en texto plano → recomendar ROTARLA en Google AI Studio.

## REDISEÑO v2 (mobile-first) — COMPLETO Y PROBADO ✅
Motivo: el usuario rechazó el diseño "informe de escritorio". Ver tasks/lessons.md.
- [x] Estética iOS limpia + marco tipo teléfono con barra de estado falsa (PhoneShell).
- [x] Interacción: deck de TARJETAS DESLIZABLES (drag + spring) con progreso tipo stories.
- [x] Pantallas reescritas: WelcomeCard, CaseCard (lista iOS), InterviewDeck, AnalyzingCard, VerdictCard.
- [x] Eliminados todos los componentes del diseño viejo (sin código muerto).
- [x] Veredicto rediseñado para móvil (scroll vertical, secciones apiladas, colores iOS).
- [x] Build + typecheck verdes.
- [x] Probado de extremo a extremo con Playwright a 390x844 (iPhone): real, 82% asilo.

## Robustez de IA (fix importante)
- gemini-3.5-flash devolvió 503 "high demand" (sobrecarga temporal de Google) → caía a demo.
- [x] Añadido: reintentos con backoff (700/1400/2100ms) ante 503/429/UNAVAILABLE.
- [x] Añadido: fallback a gemini-3.1-flash-lite (IA real) si 3.5-flash sigue caído, ANTES del demo local.
- Resultado: el usuario ya no ve "Modo demo" salvo que falte la key o falle todo.

## REDISEÑO v3 — "Diagnóstico" (definitivo) ✅
Motivo: rechazo del marco de celular y de la marca legal. Ver tasks/lessons.md.
- [x] Nueva marca: "Diagnóstico" (by x-legal). Eliminado TODO lo legal: "Juez", "veredicto",
      balanza. Icono nuevo (pulso dorado sobre azul Utah). Prompts internos reformulados.
- [x] Sin marco de celular: producto web responsive real (columna centrada, se ve nativo en móvil).
- [x] Colores institucionales del Estado de Utah (azul #012D6A + dorado #FFC323 + verde/rojo niveles).
- [x] Estética clara, elegante, glassmorphism, luces de color, sombras, motion. Máxima legibilidad.
- [x] Pensado para personas mayores: un paso claro por pantalla, "Paso X de Y", texto y botones grandes.
- [x] Pantallas: Welcome, Case, Interview (guiada), Analyzing, Result. Componentes viejos eliminados.
- [x] Build + typecheck verdes. Probado end-to-end con Playwright (móvil): diagnóstico real 82% asilo.
- [x] README y marca actualizados.

## PIVOTE v4 — Solo "Reforzamiento de asilo" + subida de documento ✅
Decisión del usuario (2026-07-01): el sistema deja de ser multi-caso con entrevista.
Ahora: el usuario SUBE su caso (PDF o Word) → la IA lo evalúa → probabilidad de
aprobación → invitación a USA Latino Prime.
- [x] Flujo nuevo: welcome → upload → analyzing → verdict (sin selección de caso ni entrevista)
- [x] UploadCard: dropzone grande (PDF/.docx/.txt, máx. 15 MB), drag&drop + validación clara
- [x] API /api/evaluate (multipart): PDF → Gemini nativo (inlineData); .docx → mammoth → texto
- [x] Prompt: óptica de juez para reforzamiento de asilo (doc = I-589/declaración/resumen)
- [x] Limpiar: rutas de preguntas/veredicto viejas, CaseCard/InterviewCard/StepBar, lib/cases
- [x] AnalyzingCard: escáner "lee el documento" (nombre + líneas skeleton + beam dorado)
- [x] Probado end-to-end con PDF real (Playwright): 62% media, la IA detectó exactamente
      las debilidades escritas en el documento (fechas inconsistentes, tránsito por Colombia).
      Nota: multipart de PowerShell (-Form) no es compatible con formData() de Next; probar
      siempre con curl.exe o navegador.
- [x] Build + typecheck verdes (hay que borrar .next tras eliminar rutas: tipos generados stale)

## DISEÑO v5 — Identidad "consola de diagnóstico" ✅ (2026-07-01)
Pedido: diseño único, que resalte, super tecnológico, animaciones/loading personalizados.
- [x] Firma visual: PULSO de electrocardiograma dorado (PulseLine) — se dibuja en welcome,
      late "EN VIVO" en el análisis, y el emblema de marca lo dibuja en bucle.
- [x] Tipografía: Space Grotesk (display) + Inter (cuerpo) + JetBrains Mono (etiquetas
      de sistema: eyebrows, telemetría, %). Clase .sys-label.
- [x] Fondo: rejilla blueprint desvanecida + auroras navy/dorado.
- [x] Upload: esquinas HUD en el dropzone (doradas al arrastrar) + chips de verificación
      animados (formato/tamaño/listo).
- [x] Loading personalizado: CONSOLA oscura en vivo — nombre del archivo + "EN VIVO"
      parpadeante, monitor de pulso en bucle, terminal con typewriter y cursor,
      telemetría (hechos/fechas/páginas) y barra de progreso segmentada dorada.
- [x] ScoreRing: marcas de calibre alrededor, punto luminoso al final del arco, radar
      sutil girando detrás (ResultCard).
- [x] Botón primario con brillo periódico (btn-sheen). prefers-reduced-motion respetado.
- [x] Probado end-to-end con PDF real (65% media, evaluación real). Build verde.

## AGENTE v2 — System prompt profesional del evaluador ✅ (2026-07-01)
Integrado el prompt del equipo (prompt_agente_evaluador_asilo_v2.md) con 2 adaptaciones
decididas por el usuario:
- [x] Se MANTIENE el % (reencuadrado como "solidez del expediente hoy", nunca garantía)
      pese a que el prompt original lo prohibía; se añade el Nivel de Preparación A/B/C.
- [x] Salida concisa + lo más valioso del informe: Matriz de Solidez por elemento legal
      (solido/refuerzo/critico) y contrainterrogatorio simulado (3-5 preguntas).
- [x] Adaptaciones técnicas: sin fase de admisión (flujo one-shot con documento: lo que
      falte baja el score y aparece en la matriz), sin etiqueta literal [VERIFICAR VIGENCIA]
      (se matiza con prudencia), salida JSON estructurada.
- [x] Schema y tipos ampliados (prepLevel, prepFactors, matrix, crossExam) + demo actualizado.
- [x] ResultCard: badge A/B/C, Matriz de solidez, "Prepárate para estas preguntas",
      disclaimer con el texto del prompt.
- [x] Probado con el PDF real: 68%/B, "Credibilidad: crítico" detectado, citas correctas
      (8 CFR § 208.15, INA § 208(a)(2)(B), Matter of S-A-), plazo de 1 año verificado con
      las fechas del documento, contrainterrogatorio realista. Build verde.

## FIX PRODUCCIÓN (juez.vercel.app) ✅ (2026-07-01)
Síntoma: el análisis no terminaba y lanzaba error en vivo. Diagnóstico con reproducción
directa contra producción (la API sí funcionaba: key OK, pero tardaba 107 s con un PDF
de 2 KB). Ver lessons.md.
- [x] thinking MEDIUM → LOW en el juez (107 s → 18.7 s medidos, misma calidad de salida);
      fallback a MINIMAL.
- [x] maxDuration 120 → 300 (colchón para documentos grandes).
- [x] Límite de subida 15 MB → 4 MB (Vercel rechaza cuerpos > 4.5 MB en el borde con 413).
- [x] Verificado contra https://juez.vercel.app tras el redeploy.

## MULTI-DOCUMENTO + ARCHIVOS GRANDES ✅ (2026-07-01)
Pedido: hasta 100 MB por archivo, lectura completa, hasta 10 documentos.
- [x] Hasta 10 documentos por evaluación (UI multi-archivo con lista, contador y "agregar otro").
- [x] Hasta 100 MB por archivo. Dos caminos:
      · total ≤ 3.5 MB → multipart directo a la función (rápido, sin dependencias);
      · total > 3.5 MB → subida DIRECTA del navegador a Vercel Blob (@vercel/blob/client)
        + análisis como TRABAJO EN SEGUNDO PLANO (after() de next/server) + la app
        consulta GET /api/evaluate?id=... cada 4 s (sobrevive al corte de ~60 s de móviles).
- [x] PDFs grandes → Files API de Gemini (hasta 2 GB); pequeños → inline. .docx → mammoth
      (hasta 300k caracteres por doc). Prompt actualizado: CRUZAR consistencia entre documentos.
- [x] Privacidad: los blobs de documentos se borran al terminar; el resultado se sirve
      una vez y se borra.
- [x] Probado local con 2 PDFs contradictorios: detectó la inconsistencia plantada
      (fecha de detención marzo vs junio ENTRE documentos, con atribución) y otra más
      (cronología del asesinato) → Nivel C por credibilidad. 16.5 s. Browser E2E ✓.
- [ ] PENDIENTE (usuario): crear el Blob store en Vercel (Storage → Create → Blob) para
      habilitar archivos > 3.5 MB en producción. Sin él, los archivos grandes muestran
      el error "almacenamiento no habilitado".

## v6 — Dos niveles: DEMO (gratis) + PREMIUM $50/uso ✅ IMPLEMENTADO (2026-07-03)
Decisiones del usuario: Stripe Checkout · /pro en el mismo proyecto · tabla de upsell
$400/$650 tal cual el ejemplo.
- [x] `/` sigue siendo el demo (iframe x-legal intacto) + CTA dorado al informe de $50.
- [x] `/pro`: landing premium → datos del cliente → subida (Blob) → Stripe Checkout $50.
- [x] `/pro/resultado`: verifica pago (anti-reuso vía job en Blob), procesa en segundo
      plano (after) con thinking MEDIUM, y entrega informe en pantalla + PDF descargable.
- [x] PDF de marca USA Latino Prime (@react-pdf/renderer): membrete, ficha del caso,
      secciones I-VIII, tabla $400/$650 con "RECOMENDADA", caja de recomendación y pie
      con paginación. Validado contra el ejemplo Vivanco (3 bugs visuales corregidos:
      solape del membrete, solape de normas, glifo ★ no soportado → "• RECOMENDADA •").
- [x] /api/checkout (crea job + sesión Stripe vía REST, sin SDK), /api/pro/run (verify
      + run + poll), /api/dev/informe-pdf (preview solo en desarrollo).
- [x] FilePicker extraído y compartido demo/premium. Bypass de desarrollo sin Stripe.
- [ ] PENDIENTE (usuario): STRIPE_SECRET_KEY en Vercel + Blob store (obligatorios
      para el premium en producción).

## Plan original v6 (referencia)
Modelo (2026-07-03): demo = app actual (embebida en x-legal, gancho). Premium $50 =
análisis profundo + genera el "Informe de Evaluación y Propuesta de Reforzamiento"
personalizado (formato del PDF de ejemplo Vivanco Franco: ficha del caso, carta al
cliente, estado actual, debilidades desarrolladas, reforzamiento recomendado, normas
legales, beneficios, tabla de costos $400/$650 y recomendación final). El informe de
$50 vende a su vez el servicio de reforzamiento — embudo: demo → $50 → $400/$650.

Arquitectura propuesta (un solo codebase, dos modos):
- `/` queda como DEMO (no romper el iframe de x-legal). CTA del demo → página premium.
- `/pro` (o dominio propio): landing premium → datos del cliente (nombre para la carta,
  email) → subida de documentos → PAGO $50 (Stripe Checkout; x-legal ya usa Stripe) →
  verificación server-side de la sesión pagada (anti-reuso) → análisis profundo
  (thinking alto, prompt de informe completo) → informe en pantalla + PDF descargable
  con la marca USA Latino Prime (@react-pdf/renderer, navy/dorado), almacenado en Blob.
- Pendientes de decisión del usuario: método de cobro, ubicación del premium, tabla
  de upsell en el PDF.

## Próximas mejoras posibles
- Exportar veredicto a PDF/compartir, follow-ups dinámicos del juez, modo voz
  (gemini-3.5-live-translate), guardado opcional con Supabase, rate-limiting, deploy en Vercel.

## Notas legales
- Disclaimer obligatorio y visible: NO es asesoría legal; consultar abogado licenciado.
