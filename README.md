# Diagnóstico ⚡ — Evalúa tu caso de asilo con IA

App web **mobile-first** (clara, elegante, de alta legibilidad) para el servicio de
**reforzamiento de asilo**: la persona **sube su caso** (solicitud I-589, declaración,
evidencias o un resumen en PDF/Word), la IA analiza el expediente a fondo y devuelve la
**solidez del expediente** (probabilidad de que un juez de inmigración lo apruebe),
junto con los puntos **a favor** y **a reforzar**. Al final se recomienda el servicio
profesional de **USA Latino Prime** ([usalatinoprime.com](https://www.usalatinoprime.com)).

Diseñada para ser fácil de usar por **personas mayores**: un paso claro por pantalla,
texto grande, alto contraste y botones grandes. Parte de la familia de marca **x-legal**.

> ⚠️ Herramienta **informativa**. No sustituye la orientación de un profesional.

---

## Dos niveles de servicio

| Nivel | Ruta | Qué entrega |
|---|---|---|
| **Demo gratis** | `/` | Diagnóstico en pantalla: score 0-100, nivel de preparación A/B/C, matriz de solidez por elemento legal, contrainterrogatorio simulado. Se embebe en iframe dentro de x-legal. |
| **Informe premium $50** | `/pro` | Análisis profundo (thinking MEDIUM) + "Informe de Evaluación y Propuesta de Reforzamiento" personalizado: en pantalla y en **PDF descargable** con la marca USA Latino Prime (ficha del caso, estado actual, debilidades desarrolladas, normas legales, tabla de costos $400/$650 y recomendación final). |

Embudo comercial: demo gratis → informe de $50 → servicio de reforzamiento ($400/$650).

## Flujo del demo (`/`)
1. **Bienvenida** → 2. **Sube tu caso** (hasta 10 documentos) →
3. **Análisis inmersivo** (consola en vivo que "lee" los documentos, fases y progreso) →
4. **Diagnóstico** (solidez, a favor / a reforzar, matriz, CTA a USA Latino Prime y al informe de $50).

## Flujo premium (`/pro`)
1. Landing premium → 2. Datos del cliente (nombre, email, país) →
3. Subida de documentos (Vercel Blob) → 4. **Stripe Checkout $50** →
5. `/pro/resultado`: verifica el pago server-side (anti-reuso vía job en Blob),
procesa en segundo plano y entrega el informe en pantalla + PDF.
En desarrollo sin Stripe hay un bypass automático; `/api/dev/informe-pdf` permite
previsualizar el PDF (solo en desarrollo).

## Documentos aceptados
Hasta **10 documentos** por evaluación, **100 MB** por archivo.

| Formato | Procesamiento |
|---|---|
| PDF ≤ 7 MB | Inline a Gemini (`inlineData`), incluye PDFs escaneados (visión) |
| PDF grande | Files API de Gemini (hasta 2 GB) |
| .docx | Texto extraído con `mammoth` en el servidor (hasta 300k caracteres) |
| .txt | Texto directo |
| .doc antiguo | No compatible — se pide convertir a PDF/.docx |

Dos caminos de envío:
- **Total ≤ 3.5 MB** → multipart directo a la función (respuesta síncrona).
- **Total > 3.5 MB** → subida directa del navegador a **Vercel Blob** (esquiva el límite
  de 4.5 MB del borde de Vercel) + análisis en segundo plano (`after()`) + polling a
  `GET /api/evaluate?id=...` cada 4 s (sobrevive al corte de ~60 s de móviles).

Con varios documentos, el prompt cruza la **consistencia entre ellos** (fechas, hechos).

## Modelos de IA (Gemini 3.x)
| Uso | Modelo | Thinking |
|---|---|---|
| Diagnóstico demo | `gemini-3.5-flash` | LOW (MEDIUM tardaba ~2 min y rompía el timeout móvil) |
| Informe premium (en segundo plano) | `gemini-3.5-flash` | MEDIUM |
| Respaldo si hay sobrecarga (503/429) | `gemini-3.1-flash-lite` | MINIMAL / LOW |

Reintentos con backoff ante errores transitorios; si todo falla, modo demo local.
Salida forzada a JSON (`responseSchema`) y normalizada en el servidor.

## Diseño
Colores institucionales del Estado de Utah (azul marino `#012D6A`, dorado `#FFC323`,
verde/dorado/rojo para niveles), glassmorphism, luces de color y micro-animaciones
(Framer Motion). Firma visual: el pulso de electrocardiograma dorado (`PulseLine`) y
la consola de análisis que "lee" el documento del usuario. Tipografías: Space Grotesk
(display) + Inter (cuerpo) + JetBrains Mono (etiquetas de sistema).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v3 · Framer Motion ·
Zustand · @google/genai (server-only) · mammoth (.docx) · @react-pdf/renderer (PDF
premium) · @vercel/blob · Stripe Checkout (vía REST, sin SDK).

## Puesta en marcha (local)
```bash
npm install
cp .env.local.example .env.local     # completa las variables (ver abajo)
npm run dev                          # http://localhost:3000
```

## Variables de entorno
| Variable | Obligatoria | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Evaluación con IA (sin ella, la app cae a modo demo local) |
| `BLOB_READ_WRITE_TOKEN` | Para archivos > 3.5 MB y todo el premium | Vercel → Storage → Create → Blob |
| `STRIPE_SECRET_KEY` | Para cobrar el informe de $50 | dashboard.stripe.com/apikeys |

## Despliegue en Vercel
1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. Añade las variables de entorno (Production y Preview).
3. Crea el Blob store (Storage → Create → Blob) y vincúlalo al proyecto.
4. Deploy. Cada `git push` a `main` redespliega.

## Integración /xlegal (embebida en x-legal)

`/xlegal?t=<token>` es la variante del informe **sin pago y sin formulario**: se embebe
en un iframe del panel de [x-legal](https://x-legal.usalatinoprime.com), que es la fuente
de verdad (emite el token, conoce al cliente, controla los intentos y guarda el PDF).
Juez genera el informe, lo entrega por **webhook firmado** y borra sus copias.

Contrato v1 (resumen):
- `GET {XLEGAL_API_URL}/api/juez/sessions/{token}` — sesión (cliente, intentos, PDF).
- `POST …/sessions/{token}/consume` — consume el intento (idempotente por `jobId`; 409 sin intentos).
- `POST {XLEGAL_API_URL}/api/webhooks/juez` — Juez entrega `evaluation.completed|failed`,
  firmado con HMAC-SHA256 del raw body en `x-juez-signature`. Reintentos 2 s / 8 s / 30 s.
  Tras el `200`, Juez borra documentos y PDF (x-legal ya lo tiene).
- `GET /api/xlegal/status?jobId=` (en Juez) — reconciliación si el webhook no llegó.
  Protegido con `x-api-key`. **Decisión v1**: la misma `XLEGAL_API_KEY` sirve en ambas
  direcciones (un solo secreto compartido).

Variables: `XLEGAL_API_URL`, `XLEGAL_API_KEY`, `XLEGAL_WEBHOOK_SECRET` (server-only;
sin ellas los endpoints responden 501). Stripe no participa en `/xlegal`.

Prueba local sin un x-legal real:
```bash
node scripts/mock-xlegal.mjs        # mock en :4545 (token sembrado, verifica la firma)
# en .env.local: XLEGAL_API_URL=http://localhost:4545 · XLEGAL_API_KEY=dev-key
#                XLEGAL_WEBHOOK_SECRET=dev-secret
npm run dev
# abre http://localhost:3000/xlegal?t=dev-token-maria-0001-abcdef
# fallos de webhook: curl "http://localhost:4545/control?failWebhook=2"
```

## Seguridad y notas de producción
- Las claves solo se usan en el servidor; `.env.local` está en `.gitignore`.
- **Privacidad**: los documentos no se guardan — se procesan y los blobs se borran al
  terminar. El resultado del demo se sirve una sola vez y se borra; el resultado
  premium sí se conserva (el cliente pagó y puede recargar/volver a descargar).
- Verificación de pago server-side (`payment_status === "paid"`) con job en Blob como
  anti-reuso de sesiones.
- Rate-limit en memoria por IP (evaluate 6/min, checkout 5/min, pro-run 10/min). Para
  límites compartidos entre instancias serverless, usar Upstash Redis / Vercel KV.
- Solo se aceptan URLs de blob del dominio `*.blob.vercel-storage.com`.
- El iframe solo se permite desde `x-legal.usalatinoprime.com`.

## Estructura
```
app/
  layout.tsx · page.tsx (wizard demo) · globals.css · icon.svg
  pro/page.tsx            # landing premium + datos + subida + checkout
  pro/resultado/page.tsx  # verificación de pago, procesamiento y entrega del informe
  api/evaluate/route.ts   # demo: multipart directo o refs de Blob + job en 2º plano
  api/upload/route.ts     # token para subida directa del navegador a Vercel Blob
  api/checkout/route.ts   # crea el job premium + sesión de Stripe ($50)
  api/pro/run/route.ts    # verifica pago, genera informe + PDF, polling del resultado
  api/dev/informe-pdf/route.ts  # preview del PDF (solo desarrollo)
components/
  Background · Header · Brand · ServicesCTA · FilePicker (compartido demo/premium)
  ui/    AnimatedNumber · Reveal · ScoreRing · PulseLine
  cards/ Welcome · Upload · Analyzing · Result
lib/
  brand · types · analysis · prompts · gemini · docs · demo · ratelimit · store
  stripe · stripe-shared · informe-pdf (PDF con @react-pdf/renderer)
tasks/
  todo.md (bitácora del proyecto) · lessons.md (lecciones aprendidas)
```
