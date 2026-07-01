# Diagnóstico ⚡ — Evalúa tu caso de asilo con IA

App web **mobile-first** (clara, elegante, de alta legibilidad) para el servicio de
**reforzamiento de asilo**: la persona **sube su caso** (solicitud I-589, declaración o
un resumen en PDF/Word), la IA analiza el expediente a fondo y devuelve la
**probabilidad de que un juez de inmigración lo apruebe**, junto con los puntos
**a favor** y **a reforzar**. Al final se recomienda el servicio profesional de
**USA Latino Prime** ([usalatinoprime.com](https://www.usalatinoprime.com)).

Diseñada para ser fácil de usar por **personas mayores**: un paso claro por pantalla,
texto grande, alto contraste y botones grandes. Parte de la familia de marca **x-legal**.

> ⚠️ Herramienta **informativa**. No sustituye la orientación de un profesional.

---

## Flujo
1. **Bienvenida** → 2. **Sube tu caso** (PDF, .docx o .txt · máx. 15 MB) →
3. **Análisis inmersivo** (escáner que "lee" el documento, fases y progreso) →
4. **Diagnóstico** (probabilidad de aprobación, a favor / a reforzar, CTA a USA Latino Prime).

## Cómo se procesa el documento
| Formato | Procesamiento |
|---|---|
| PDF | Se envía nativo a Gemini (`inlineData`), incluye PDFs escaneados (visión) |
| .docx | Texto extraído con `mammoth` en el servidor |
| .txt | Texto directo |
| .doc antiguo | No compatible — se pide convertir a PDF/.docx |

## Modelos de IA (Gemini 3.x)
| Uso | Modelo | Thinking |
|---|---|---|
| Evaluación del expediente | `gemini-3.5-flash` | MEDIUM |
| Respaldo si hay sobrecarga (503/429) | `gemini-3.1-flash-lite` | LOW |

Reintentos con backoff ante errores transitorios; si todo falla, modo demo local.

## Diseño
Colores institucionales del Estado de Utah (azul marino `#012D6A`, dorado `#FFC323`,
verde/dorado/rojo para niveles), glassmorphism, luces de color y micro-animaciones
(Framer Motion). El momento firma: el escáner que "lee" el documento del usuario.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind CSS v3 · Framer Motion · Zustand ·
@google/genai (server-only) · mammoth (.docx).

## Puesta en marcha (local)
```bash
npm install
cp .env.local.example .env.local     # pega tu key en GEMINI_API_KEY
npm run dev                          # http://localhost:3000
```

## Despliegue en Vercel
1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. Añade la variable `GEMINI_API_KEY` (Production y Preview).
3. Deploy. Cada `git push` a `main` redespliega.

## Seguridad y notas de producción
- `GEMINI_API_KEY` solo se usa en el servidor; `.env.local` está en `.gitignore`.
- El documento del usuario **no se guarda**: se procesa en memoria y se descarta.
- Rate-limit en memoria (6 evaluaciones/min por IP). Para límites compartidos entre
  instancias serverless, usar Upstash Redis / Vercel KV.
- Límite de archivo: 15 MB (dentro del límite de 20 MB por solicitud de Gemini).

## Estructura
```
app/
  layout.tsx · page.tsx (controlador) · globals.css
  api/evaluate/route.ts   # multipart → PDF nativo o texto → Gemini (+ rate-limit + fallback)
components/
  Background · Header · Brand · ServicesCTA
  ui/    AnimatedNumber · Reveal · ScoreRing
  cards/ Welcome · Upload · Analyzing · Result
lib/
  brand · types · analysis · prompts · gemini · demo · ratelimit · store
```
