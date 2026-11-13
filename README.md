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
npm test                             # node:test + tsx (lib/__tests__)
```

## Variables de entorno
| Variable | Obligatoria | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Evaluación con IA (sin ella, la app cae a modo demo local) |
| `BLOB_READ_WRITE_TOKEN` | Para archivos > 3.5 MB y todo el premium | Vercel → Storage → Create → Blob |
| `STRIPE_SECRET_KEY` | Para cobrar el informe de $50 | dashboard.stripe.com/apikeys |
| `CRON_SECRET` | **Sí, en Production** (purga diaria de `xlegal/`) | Valor aleatorio de ≥ 32 bytes, tipo *sensitive*, solo en Production: Vercel → Settings → Environment Variables. Vercel lo envía solo al cron. Sin ella el cron recibe `503` todos los días y la retención de 30 días queda en manos de la red de `POST /api/xlegal/jobs`, que solo corre cuando ContyGo pide una evaluación |

## Despliegue en Vercel
1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. Añade las variables de entorno (Production y Preview).
3. Crea el Blob store (Storage → Create → Blob) y vincúlalo al proyecto.
4. Deploy. Cada `git push` a `main` redespliega.

## Integración /xlegal (embebida en ContyGo)

`/xlegal?t=<token>` es la variante del informe **sin pago y sin formulario**: se embebe
en un iframe del panel de [ContyGo](https://contygo.app), que es la fuente
de verdad (emite el token, conoce al cliente, controla los intentos y guarda el PDF).
Juez genera el informe, lo entrega por **webhook firmado** y borra sus copias.

Contrato v1 (resumen):
- `GET {XLEGAL_API_URL}/api/juez/sessions/{token}` — sesión (cliente, intentos, PDF).
- `POST …/sessions/{token}/consume` — consume el intento (idempotente por `jobId`; 409 sin intentos).
- `POST {XLEGAL_API_URL}/api/webhooks/juez` — Juez entrega `evaluation.completed|failed`,
  firmado con HMAC-SHA256 del raw body en `x-juez-signature`. Reintentos 2 s / 8 s / 30 s.
  Tras el `200`, Juez borra documentos y PDF (x-legal ya lo tiene) y olvida al cliente
  (ver *Retención de `xlegal/`*).
- `GET /api/xlegal/status?jobId=` (en Juez) — reconciliación si el webhook no llegó.
  Protegido con `x-api-key`. **Decisión v1**: la misma `XLEGAL_API_KEY` sirve en ambas
  direcciones (un solo secreto compartido).

**Servidor a servidor (v2, 2026-09-16)** — sin iframe. ContyGo arranca la evaluación
directamente y ya no hacen falta la sesión ni el `consume` del lado de Juez:
- `POST /api/xlegal/jobs` (en Juez), con `x-api-key: XLEGAL_API_KEY`. Body:
  `{ jobId, token, cliente: { nombre, email, pais? }, files: [{ url, name }] }`.
  - `jobId` lo acuña ContyGo, que ya consumió el intento. La petición es **idempotente**
    por `jobId`: repetirla responde `202` sin volver a generar.
  - `token` es el de la evaluación en ContyGo. Solo viaja de vuelta en el webhook, que
    es el mismo de v1.
  - `files`: de 1 a 10. Cada `url` debe ser HTTPS y, o bien de nuestro Blob, o bien una
    **URL firmada** de Supabase (`*.supabase.co/storage/v1/object/sign/…`). El `name`
    tiene que terminar en `.pdf`, `.docx` o `.txt`.
  - Responde `202 { jobId, status }`. El resultado llega por el webhook firmado y, si
    este falla, por `/api/xlegal/status`.
  - Los documentos se leen de las URLs firmadas: no se copian a nuestro almacenamiento
    ni se borran desde aquí (no son nuestros). El PDF temporal sí se borra tras el webhook.

Variables: `XLEGAL_API_URL`, `XLEGAL_API_KEY`, `XLEGAL_WEBHOOK_SECRET` (server-only;
sin ellas los endpoints responden 501). Stripe no participa en `/xlegal`.

### Retención de `xlegal/` (desde 2026-11-12)
- **Al entregar** (x-legal responde `2xx` al webhook): además de documentos y PDF,
  `xlegal/results/<jobId>.json` se reescribe a solo `{ status, completedAt, webhookDelivered: true }`
  —sin score, nivel, headline, nombre, correo, país ni documentos— y se borran
  `xlegal/jobs/<jobId>.json` y su `xlegal/tokens/<tokenHash>.json`. `/api/xlegal/status`
  responde entonces `done` sin `result`; `GET /api/xlegal/run` pide el enlace del PDF a x-legal.
  Si la reescritura falla dos veces, el resultado completo se **borra** en vez de quedarse,
  y el mapeo del token (`{ jobId }`) se deja para que la página que sigue sondeando
  encuentre su informe en x-legal.
  La lógica vive en `lib/xlegal-closeout.ts` (con tests en `lib/__tests__/`).
- **Si el webhook no llega**, el resultado completo y el PDF se quedan: son la red de
  reconciliación de `/api/xlegal/status`.
- **Un job fallido** cuyo `evaluation.failed` x-legal aceptó conserva solo
  `{ status: "error", error }`: se borra el job. El mapeo del token (`{ jobId }`, sin datos
  del cliente) se deja: x-legal devuelve el intento y la página puede estar escribiendo el
  de un reintento en ese momento. La página embebida sigue viendo el error
  (`GET /api/xlegal/run` lo lee del resultado).
- `GET /api/xlegal/run` sin job: un `jobId` que no tiene resultado (o cuyo resultado aún no
  se entregó) responde `404` sin preguntar a x-legal, salvo que el mapeo de ese mismo token
  apunte a ese `jobId` (una entrega cuya redacción falló): entonces pregunta a x-legal.
- Si el presupuesto cierra el job mientras se genera, el PDF tardío no se guarda (y si ya
  se estaba subiendo, se borra). Si vence cuando el informe ya estaba listo (durante el
  webhook), el job espera a que termine el cierre y se olvide al cliente.
- Si no se puede escribir el resultado completo, el webhook se envía igual (lleva el
  `pdfUrl`). Si además el webhook falla, nada puede reconciliar ese informe: se borran el
  PDF y nuestras copias de los documentos.
- El cierre del job solo borra blobs propios bajo `xlegal/docs/` y `xlegal/informes/`, y
  `POST /api/xlegal/run` solo acepta documentos subidos a `xlegal/docs/`.
- **A los 30 días**, todo lo que haya bajo `xlegal/` (jobs, results, tokens, docs, informes)
  se borra, según la fecha de subida del blob (`uploadedAt`; en local, el `mtime`). Reglas
  en `lib/retention.ts`, barrido en `lib/xlegal-purge.ts`.
  - `GET /api/xlegal/purge`, llamado una vez al día por el cron de `vercel.json`, con
    `Authorization: Bearer <CRON_SECRET>`. **`CRON_SECRET` es obligatoria en Vercel**
    (Production): sin ella la ruta responde `503`, no borra nada y lo deja en el log. Es
    el barrido de verdad: sin tope, y además reduce los resultados entregados **antes** del
    2026-11-12 (que aún llevan el informe) igual que una entrega de hoy.
  - Red sin secreto nuevo: cada `POST /api/xlegal/jobs` autenticado lanza el barrido en
    segundo plano (`after()`) como mucho una vez cada 24 h. Comparte la invocación con la
    evaluación, así que borra como mucho 500 objetos (los más viejos primero) y no lee
    resultados.
  - El marcador `xlegal/.purge-marker.json` (que el barrido no borra) se escribe solo tras
    un barrido completo: si se cortó, llegó al tope o falló un borrado, la siguiente
    petición lo reintenta.
  - **Solo en producción** (`VERCEL_ENV=production`), o en local **sin**
    `BLOB_READ_WRITE_TOKEN` (`.dev-store/`). Es una lista blanca: un preview, `development`
    o un `next dev` con el token del Blob en `.env.local` llegan al mismo Blob de
    producción y nunca barren.
  - Primera ejecución tras el deploy, sin esperar al cron de las 08:00 UTC, desde una
    shell donde la variable no se imprima:
    `curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio-de-juez>/api/xlegal/purge`.
    En los logs: `[xlegal:purge] cron: scanned N, expired M …` con `200`.
- **Fuera de alcance**: `pro/` (flujo premium propio, el cliente pagó y puede volver a
  descargar) y el demo.
- Los PDF grandes que se suben a la Files API de Gemini se borran al terminar cada
  evaluación, en todos los flujos (`lib/gemini-uploads.ts`): la evaluación espera a las
  subidas que siguen en vuelo y a sus borrados antes de terminar.
- `/api/upload` solo emite tokens para `casos/` y `xlegal/docs/`; las lecturas y borrados
  por pathname exigen el pathname exacto (`lib/storage-paths.ts`).

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
  premium sí se conserva (el cliente pagó y puede recargar/volver a descargar). Lo de
  `/xlegal` se reduce al entregar y se purga a los 30 días (ver arriba).
- Verificación de pago server-side (`payment_status === "paid"`) con job en Blob como
  anti-reuso de sesiones.
- Rate-limit en memoria por IP (evaluate 6/min, checkout 5/min, pro-run 10/min). Para
  límites compartidos entre instancias serverless, usar Upstash Redis / Vercel KV.
- Solo se aceptan URLs de blob del dominio `*.blob.vercel-storage.com`, y el navegador
  solo puede subir a `casos/` y `xlegal/docs/`.
- Los logs de `/xlegal` llevan el código de error, no el mensaje: un `CODIGO:detalle`
  suele llevar el nombre del documento. Ni la puntuación del informe ni el mensaje de un
  error de Blob que pueda citar una URL (`safeBlobErrorMessage`) llegan al log.
- El iframe solo se permite desde `contygo.app` y, mientras dure su alias de
  migración, desde `x-legal.usalatinoprime.com` (ver `next.config.mjs`).

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
