# Diagnóstico ⚡ — Evalúa tu caso de inmigración con IA

App web **mobile-first** (estética clara, elegante y de alta legibilidad) donde una persona
responde unas preguntas simples sobre su situación migratoria y recibe un **diagnóstico**
claro de la **probabilidad de éxito** de su caso en EE. UU., generado con IA (Gemini).

Diseñada para ser fácil de usar por **personas mayores**: un paso claro por pantalla,
texto grande, alto contraste y botones grandes. Parte de la familia de marca **x-legal**.

> ⚠️ Herramienta **informativa**. No sustituye la orientación de un profesional.

---

## Tipos de caso soportados
- **Asilo político** — solicitud inicial por persecución.
- **Reforzamiento de asilo** — fortalecer un caso ya presentado.
- **Apelación ante la BIA** — apelar una decisión negativa.
- **Cambio de corte / venue** — trasladar el caso a otra jurisdicción.

## Diseño
- **Colores institucionales del Estado de Utah**: azul marino `#012D6A`, dorado `#FFC323`,
  verde `#1C9253` (alta), dorado (media), rojo `#E51837` (baja).
- Estética **clara, elegante y minimalista** con glassmorphism, luces de color, sombras
  suaves y micro-animaciones (Framer Motion). Sin marcos de "maqueta": producto real y
  responsive que se ve nativo en móvil.

## Modelos de IA (Gemini 3.x)
| Uso | Modelo | Thinking |
|---|---|---|
| Diagnóstico (resultado) | `gemini-3.5-flash` | MEDIUM |
| Preguntas de la entrevista | `gemini-3.1-flash-lite` | MINIMAL |

Reintentos con backoff ante errores transitorios (503/429) y **fallback a
`gemini-3.1-flash-lite`** si el modelo principal está sobrecargado, antes del modo demo.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS v3 · Framer Motion · Zustand ·
@google/genai (llamadas **solo en el servidor**).

## Puesta en marcha (local)
```bash
npm install
cp .env.local.example .env.local     # pega tu key en GEMINI_API_KEY
npm run dev                          # http://localhost:3000
```

## Despliegue en Vercel
Listo para CI/CD (cada `git push` a `main` redespliega):
1. En [vercel.com/new](https://vercel.com/new), **importa** el repositorio.
2. En **Environment Variables**, añade `GEMINI_API_KEY` (Production y Preview).
3. **Deploy**. Next.js se detecta automáticamente.

## Seguridad y notas de producción
- `GEMINI_API_KEY` solo se usa en el servidor (Route Handlers); nunca llega al cliente.
  `.env.local` está en `.gitignore`.
- Sin login ni base de datos (stateless): la historia del usuario **no se guarda**.
- Rutas API con **rate-limit en memoria** (best-effort). Para límites robustos y
  compartidos entre instancias serverless, usar **Upstash Redis** o **Vercel KV**.

## Estructura
```
app/
  layout.tsx · page.tsx (controlador) · globals.css
  api/interview/questions/route.ts   # gemini-3.1-flash-lite (+ rate-limit + fallback)
  api/verdict/route.ts               # gemini-3.5-flash (+ rate-limit + fallback)
components/
  Background · Header · Brand · StepBar
  ui/    AnimatedNumber · Reveal · ScoreRing
  cards/ Welcome · Case · Interview · Analyzing · Result
lib/
  brand · types · cases · prompts · gemini · demo · ratelimit · store
```

## Flujo
1. **Bienvenida** → 2. **Tu situación** (tipo de caso) → 3. **Preguntas** (una por
pantalla + tu historia) → 4. **Analizando** → 5. **Tu diagnóstico** (probabilidad,
factores, fortalezas/riesgos, recomendaciones y próximos pasos).
