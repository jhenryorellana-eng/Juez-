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

Reintentos con backoff ante errores transitorios, y uno más (aparte) si la respuesta no es
JSON válido; si todo falla, modo demo local.
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
npm ci                               # sin install scripts (.npmrc: ignore-scripts=true)
cp .env.local.example .env.local     # completa las variables (ver abajo)
npm run dev                          # http://localhost:3000
npm test                             # node:test + tsx (lib/__tests__)
```

`.npmrc` lleva `ignore-scripts=true`: ningún `npm install`/`npm ci` ejecuta los install
scripts de las dependencias (ni en local ni en Vercel). Los binarios nativos llegan como
`optionalDependencies` del lock: sharp por `@img/sharp-*` y esbuild (de `tsx`) por
`@esbuild/*`. Si un paquete nuevo falla al cargar su binario, lee su script y, solo si hace
falta, `npm rebuild <paquete> --ignore-scripts=false`.

## Variables de entorno
| Variable | Obligatoria | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | Sí | Evaluación con IA (sin ella, la app cae a modo demo local) |
| `BLOB_READ_WRITE_TOKEN` | Para archivos > 3.5 MB y todo el premium | Vercel → Storage → Create → Blob |
| `STRIPE_SECRET_KEY` | Para cobrar el informe de $50 | dashboard.stripe.com/apikeys |
| `CRON_SECRET` | **Sí, en Production** (purga diaria de `xlegal/`) | Valor aleatorio de ≥ 32 bytes, tipo *sensitive*, solo en Production: Vercel → Settings → Environment Variables. Vercel lo envía solo al cron. Sin ella, o con menos de 32 bytes (UTF-8), el cron recibe `503` todos los días y la retención de 30 días queda en manos de la red de `POST /api/xlegal/jobs`, que solo corre cuando ContyGo pide una evaluación |

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
  firmado con HMAC-SHA256 del raw body en `x-juez-signature`. Cuántos envíos y cuánto
  espera cada uno depende del tiempo que le queda a la función cuando sale el webhook
  (`webhookScheduleFor` en `lib/xlegal.ts`; desde el 2026-11-14), siempre dejando 10 s
  para las escrituras y borrados del cierre:
  - **Con tiempo de sobra** (la generación dejó ≥ 230 s): cuatro envíos (0 / 2 s / 8 s /
    30 s), 45 s cada uno.
  - **Entrega normal** (una generación de ~2 min): tres envíos (0 / 2 s / 8 s), cada uno
    tan largo como quepa, hasta 45 s; con ~2 min de generación, los 45 s enteros.
  - **Presupuesto agotado** (`TIMEOUT_BUDGET`, o un informe que estuvo listo cuando ya
    vencía): quedan los 60 s de `CLOSEOUT_RESERVE_MS`, y los tres envíos se cortan a los
    ~12-13 s; peor caso 46 s. Un test recorre todos los tiempos restantes, de 15 s a
    300 s, y comprueba que el peor caso cabe.
  - Con casi nada (la reserva se consumió antes del cierre): un solo envío con lo que quede.

  Por qué 45 s: x-legal contesta `evaluation.completed` solo cuando terminó todo, y antes
  descarga el PDF con un timeout de 30 s (su handler tiene `maxDuration` 60). Con 45 s no
  se corta un x-legal lento que sí va a terminar. El cuarto envío solo existe si los
  cuatro caben a 45 s: cortado el tercero a los 45 s y esperados 30 s, llega pasados los
  60 s de `maxDuration` de x-legal, así que encuentra el evento ya procesado (`200` al
  momento, y Juez olvida al cliente) o reintenta limpio. Si no caben cuatro, se prefiere
  un envío más largo a uno más: un envío cortado es lo que duplica la cadena en x-legal
  (abajo), y un 5xx de más de 10 s es lo que cubre la reconciliación.
  Hasta el 2026-11-14 eran tres envíos de 12 s en todos los casos; antes, cuatro sin
  tope por envío. Si fallan todos, la red es `/api/xlegal/status`.
  Tras el `200`, Juez borra el PDF (x-legal ya lo tiene) y olvida al cliente
  (ver *Retención de `xlegal/`*).

  Dos límites conocidos de este contrato:
  - **Un envío cortado no detiene a x-legal.** Si x-legal tarda más que el tope de ese
    envío, el reintento llega mientras el primero sigue trabajando: `claimWebhookEvent`
    encuentra el evento reclamado y sin procesar, contesta `retry`, y x-legal ejecuta la
    cadena entera **dos veces** en paralelo (la línea de «Tu evaluación está lista» del
    cliente y sus avisos, por duplicado). Con 45 s por envío solo pasa con un x-legal de
    más de 45 s; en el camino del presupuesto agotado, con uno de más de ~12 s.
    Seguimiento en x-legal: que un reclamo **en curso** conteste `409` sin volver a
    procesar (como ya hace su idempotencia de escrituras de entrada con `in_progress`).
  - **Un resultado que x-legal sí procesó puede quedarse como no entregado.** Si se cortan
    todos los envíos pero x-legal terminó, el resultado sigue con `webhookDelivered: false`:
    el informe completo, el cliente y el PDF se quedan en `xlegal/` **hasta la purga de 30
    días**. La reconciliación de x-legal no lo pide, porque solo revisa evaluaciones
    `in_progress` y esta ya figura como completada. Seguimiento posible (no en este PR):
    que el cron diario reenvíe el webhook de los resultados no entregados de más de 1 h;
    el dedupe de x-legal contesta `200` al momento y entonces Juez olvida al cliente.
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
  - `files`: de 1 a 10. Cada `url` debe ser una **URL firmada** de Supabase por HTTPS
    (`https://<ref>.supabase.co/storage/v1/object/sign/…`), que es lo que ContyGo envía
    (firma cada documento del caso por 10 minutos). El `name` tiene que terminar en
    `.pdf`, `.docx` o `.txt`. Desde el 2026-11-14, una URL de nuestro Blob se rechaza con
    `400` (antes se aceptaba, aunque ContyGo nunca la usó): un job lista sus documentos, y
    una URL nuestra —el PDF de otro job en `xlegal/informes/`, sus documentos, `casos/`—
    se habría leído y enviado a Gemini a petición de quien llamaba.
  - Responde `202 { jobId, status }`. El resultado llega por el webhook firmado y, si
    este falla, por `/api/xlegal/status`.
  - Los documentos se leen de las URLs firmadas: no se copian a nuestro almacenamiento
    ni se borran desde aquí (no son nuestros). El cierre de un job con `source: "api"` no
    borra ninguno de los documentos que lista, aunque alguno fuera un blob nuestro. El PDF
    temporal sí se borra tras el webhook.

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
- **En cuanto existe el informe**, nuestras copias de los documentos (`xlegal/docs/`) se
  borran, antes del webhook y pase lo que pase con él: la reconciliación sirve el resultado y
  el PDF, nunca los documentos.
  - Si la instancia muere justo entre ese borrado y la escritura del resultado, el job queda
    con registro y sin resultado, y sus documentos ya no existen: un reintento que
    reutilice ese registro falla con **`DOWNLOAD_FAILED`, y es lo esperado**. Es el precio
    de borrar antes. La página sube los documentos de nuevo en cada envío, y en el flujo
    servidor a servidor ContyGo los vuelve a firmar.
- **Si el webhook no llega**, el resultado completo y el PDF se quedan: son la red de
  reconciliación de `/api/xlegal/status`.
- **Un job fallido**: primero se borran nuestras copias de los documentos, y después se
  escriben el resultado de error y el `evaluation.failed`, igual que en la entrega. Así una
  instancia congelada durante el backoff del webhook no los deja 30 días. Si x-legal acepta
  el `evaluation.failed`, queda solo `{ status: "error", error }` y se borra el job. El mapeo del token (`{ jobId }`, sin datos
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
  `pdfUrl`). Si además el webhook falla, nada puede reconciliar ese informe: se borra
  también el PDF (salvo que el resultado sí se haya escrito: entonces se queda con él).
- El cierre del job solo borra blobs propios bajo `xlegal/docs/` y `xlegal/informes/`, y
  nunca los documentos de un job servidor a servidor (`source: "api"`).
  `POST /api/xlegal/run` solo acepta documentos subidos a `xlegal/docs/`, y
  `POST /api/xlegal/jobs`, solo URLs firmadas de Supabase. Un borrado que
  falla queda en el log como un número («could not delete N of M»), nunca como URL; lo
  retira la purga de 30 días.
- **A los 30 días**, todo lo que haya bajo `xlegal/` (jobs, results, tokens, docs, informes)
  se borra, según la fecha de subida del blob (`uploadedAt`; en local, el `mtime`). Reglas
  en `lib/retention.ts`, barrido en `lib/xlegal-purge.ts`.
  - `GET /api/xlegal/purge`, llamado una vez al día por el cron de `vercel.json`, con
    `Authorization: Bearer <CRON_SECRET>`. **`CRON_SECRET` es obligatoria en Vercel**
    (Production): sin ella, o si tiene menos de 32 bytes en UTF-8, la ruta responde `503`,
    no borra nada y lo deja en el log (sin el valor). Es
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
- **Fuera de alcance: `casos/` y `pro/` NO entran en el barrido de 30 días**, que solo
  recorre `xlegal/`. `pro/` es el flujo premium (el cliente pagó y puede volver a
  descargar). `casos/` tiene los documentos del demo y del premium: `/api/evaluate` y
  `/api/pro/run` los borran al terminar, pero si el job falla o la función muere antes del
  `del()`, lo subido se queda **sin límite de retención**. Ya pasaba antes de este cambio.
  Seguimiento: extender el barrido a una lista de prefijos con el mismo corte.
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
- El navegador solo puede subir a `casos/` y `xlegal/docs/` (`/api/upload`), y cada flujo
  solo acepta los suyos: `/api/evaluate` y `/api/checkout` (JSON), URLs de Blob bajo
  `casos/` (`isDemoUploadedDocUrl`); `POST /api/xlegal/run`, bajo `xlegal/docs/`
  (`isXlegalUploadedDocUrl`). Los dos primeros borran al terminar los archivos que se les
  dieron: sin esa regla, su `del()` final podía borrar cualquier blob de `xlegal/`.
- Los logs de `/xlegal` (sus cuatro rutas, el job, el cierre, la purga y las llamadas a
  x-legal), los del demo (`/api/evaluate`), los del flujo premium (`/api/checkout`,
  `/api/upload`, `/api/pro/run`, desde el 2026-11-14), los de Gemini y los de
  `lib/storage.ts` llevan el código de error, no el mensaje: un `CODIGO:detalle` suele
  llevar el nombre del documento, y un error de Stripe puede citar el correo. Un mensaje
  sin código no se registra (ni truncado): solo el tipo del error, y el estado HTTP si es
  un `ApiError` de Gemini (`lib/safe-error.ts`). Lo vigila `lib/__tests__/log-hygiene.test.ts`,
  que falla si alguna llamada a `console.*` (también `debug` y `trace`) de esos archivos
  usa un `message` o un `stack`, o imprime el error mismo (`error`, `err` o `e` como
  argumento, `${error}`, `String(error)`, `{ error }`). Un envío del webhook que se cortó
  por tiempo queda como `TimeoutError`. Una respuesta del modelo que no es JSON válido se
  convierte en `MODEL_JSON_INVALID`, sin su texto (el `SyntaxError` lo citaba), y se
  reintenta **una vez**, con su propio contador (no gasta los reintentos de un 503/429).
  Ni la puntuación del informe ni el mensaje de un error de Blob que pueda citar una URL
  (`safeBlobErrorMessage`, que de un error que no es de Blob deja lo mismo que
  `safeErrorMessage`) llegan al log.
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
