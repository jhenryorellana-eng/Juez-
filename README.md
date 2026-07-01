# El Juez ⚖️ — Evaluador de casos de inmigración con IA

Un "probador" donde una persona relata su historia de migración, una IA le hace una
entrevista adaptada a su tipo de caso, y un **Juez** con IA evalúa la **probabilidad de
éxito** de su caso de inmigración en EE. UU.

Experiencia paso a paso, minimal-premium, con transiciones fluidas, un loader de
"deliberación del Juez" y un veredicto animado.

> ⚠️ **Aviso legal:** Es una herramienta **educativa**. **No es asesoría legal.**
> Cada caso es único; siempre consulta con un abogado de inmigración licenciado.

---

## Tipos de caso soportados
- **Asilo político** — solicitud inicial por persecución.
- **Reforzamiento de asilo** — fortalecer un caso ya presentado.
- **Apelación ante la BIA** — apelar una decisión negativa.
- **Cambio de corte / venue** — trasladar el caso a otra jurisdicción.

## Modelos de IA (Gemini 3.x)
Elegidos desde la [página de precios oficial](https://ai.google.dev/gemini-api/docs/pricing):

| Uso | Modelo | Por qué |
|---|---|---|
| Veredicto del Juez | `gemini-3.5-flash` | El más inteligente, para el razonamiento legal del caso |
| Preguntas de la entrevista | `gemini-3.1-flash-lite` | Rápido y económico para generar preguntas dinámicas |

Si no hay API key configurada, la app funciona en **modo demo** (preguntas estándar +
veredicto simulado) para que puedas probar la experiencia completa sin conexión.

## Stack
- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v3** (estilo minimal-premium)
- **Framer Motion** (transiciones y micro-animaciones)
- **Zustand** (estado del flujo)
- **@google/genai** (SDK oficial de Gemini, llamadas **solo en el servidor**)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar la API key de Gemini
cp .env.local.example .env.local
#   y pega tu key (https://aistudio.google.com/apikey) en GEMINI_API_KEY

# 3. Desarrollo
npm run dev        # http://localhost:3000

# 4. Producción
npm run build
npm run start
```

## Seguridad
- `GEMINI_API_KEY` se usa **únicamente en Route Handlers del servidor**; nunca se expone
  al cliente ni se incluye en el bundle.
- Sin login ni base de datos: la historia del usuario **no se guarda** (stateless).
- `.env.local` está en `.gitignore`. Nunca subas tu key al repositorio.

## Estructura

```
app/
  layout.tsx            # fuente Inter, metadata, lang=es
  page.tsx              # orquestador del wizard (transiciones entre pasos)
  globals.css           # estilos base + utilidades premium
  api/
    interview/questions/route.ts   # gemini-3.1-flash-lite (+ fallback)
    verdict/route.ts               # gemini-3.5-flash (+ fallback)
components/
  Background, TopBar, StepProgress, Disclaimer
  ui/        AnimatedNumber, Reveal, ScoreRing
  steps/     Hero · CaseType · Interview · Analyzing · Verdict
lib/
  types · cases · prompts · gemini · demo · store
```

## Flujo
1. **Hero** → 2. **Tipo de caso** → 3. **Entrevista** (preguntas IA + relato) →
4. **El Juez delibera** (loader) → 5. **Veredicto** (probabilidad, factores,
fortalezas/riesgos, recomendaciones, próximos pasos).
