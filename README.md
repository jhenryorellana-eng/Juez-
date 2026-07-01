# El Juez ⚖️ — Evaluador de casos de inmigración con IA

App **mobile-first** (estilo iOS, tarjetas deslizables) donde una persona relata su
historia de migración, una IA le hace una entrevista adaptada a su tipo de caso, y un
**Juez** con IA evalúa la **probabilidad de éxito** de su caso de inmigración en EE. UU.

Experiencia paso a paso con tarjetas deslizables, barra de progreso tipo "stories",
un loader de "deliberación del Juez" y un veredicto animado.

> ⚠️ **Aviso legal:** Es una herramienta **educativa**. **No es asesoría legal.**
> Cada caso es único; siempre consulta con un abogado de inmigración licenciado.

---

## Tipos de caso soportados
- **Asilo político** — solicitud inicial por persecución.
- **Reforzamiento de asilo** — fortalecer un caso ya presentado.
- **Apelación ante la BIA** — apelar una decisión negativa.
- **Cambio de corte / venue** — trasladar el caso a otra jurisdicción.

## Modelos de IA (Gemini 3.x)
| Uso | Modelo | Thinking |
|---|---|---|
| Veredicto del Juez | `gemini-3.5-flash` | MEDIUM |
| Preguntas de la entrevista | `gemini-3.1-flash-lite` | MINIMAL |

- **Robustez:** reintentos con backoff ante errores transitorios (503/429) y, si el
  modelo principal sigue sobrecargado, **fallback a `gemini-3.1-flash-lite`** (sigue
  siendo IA real) antes de recurrir al modo demo local.
- **Modo demo:** si no hay `GEMINI_API_KEY`, la app funciona con preguntas estándar y
  un veredicto simulado, para probar la experiencia completa sin conexión.

## Stack
- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v3** (estética iOS limpia)
- **Framer Motion** (tarjetas deslizables, gestos, micro-animaciones)
- **Zustand** (estado del flujo)
- **@google/genai** (SDK oficial de Gemini, llamadas **solo en el servidor**)

## Puesta en marcha (local)

```bash
npm install
cp .env.local.example .env.local     # pega tu key en GEMINI_API_KEY
npm run dev                          # http://localhost:3000
```
Ábrelo en el móvil o reduce la ventana del navegador a un ancho de teléfono.

## Despliegue en Vercel

Este repo está listo para Vercel con CI/CD (cada `git push` a `main` redespliega):

1. En [vercel.com/new](https://vercel.com/new), **importa** el repositorio `Juez-`.
2. En **Environment Variables**, añade:
   - `GEMINI_API_KEY` = tu clave de Gemini · entornos: **Production** y **Preview**.
3. **Deploy**. Framework detectado automáticamente (Next.js), sin configuración extra.

> La `GEMINI_API_KEY` se lee solo en el servidor (Route Handlers). Nunca se expone al
> cliente ni se incluye en el bundle, y `.env.local` está en `.gitignore`.

## Seguridad y notas de producción
- Sin login ni base de datos: la historia del usuario **no se guarda** (stateless).
- Las rutas API tienen un **rate-limit en memoria** (best-effort) como primera línea
  de defensa. En serverless cada instancia tiene su propia memoria, así que para
  límites robustos y compartidos conviene usar **Upstash Redis** o **Vercel KV**.
- Rota la `GEMINI_API_KEY` si sospechas que se expuso.

## Estructura

```
app/
  layout.tsx            # fuente, metadata, viewport móvil
  page.tsx              # controlador del deck (transiciones entre pasos)
  globals.css           # estilos base iOS
  api/
    interview/questions/route.ts   # gemini-3.1-flash-lite (+ rate-limit + fallback)
    verdict/route.ts               # gemini-3.5-flash (+ rate-limit + fallback)
components/
  PhoneShell · StoriesProgress
  ui/     AnimatedNumber · Reveal · ScoreRing
  cards/  Welcome · Case · InterviewDeck · Analyzing · Verdict
lib/
  types · cases · prompts · gemini · demo · ratelimit · store
```

## Flujo
1. **Bienvenida** → 2. **Tipo de caso** (lista iOS) → 3. **Entrevista** (tarjetas
deslizables: preguntas IA + relato) → 4. **El Juez delibera** (loader) →
5. **Veredicto** (probabilidad, factores, fortalezas/riesgos, recomendaciones, pasos).
