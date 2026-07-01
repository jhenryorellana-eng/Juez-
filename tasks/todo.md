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

## Próximas mejoras posibles
- Exportar veredicto a PDF/compartir, follow-ups dinámicos del juez, modo voz
  (gemini-3.5-live-translate), guardado opcional con Supabase, rate-limiting, deploy en Vercel.

## Notas legales
- Disclaimer obligatorio y visible: NO es asesoría legal; consultar abogado licenciado.
