# Lecciones del proyecto Diagnóstico (antes "El Juez")

## 2026-06-30: El diseño inicial fue "informe de escritorio", no app móvil
**Error**: UI de escritorio (multipantalla, secciones largas). Rechazado.
**Regla**: Definir PRIMERO el paradigma (mobile-first, un paso por pantalla) y confirmarlo.

## 2026-06-30: El marco de "maqueta de celular" pareció poco profesional
**Error**: Envolví la app en un marco de teléfono con barra de estado falsa (9:41). El usuario
dijo que "parece la maqueta de un celular", no un producto real.
**Regla**: NO usar marcos de teléfono. Hacer un producto web responsive real que se vea
nativo en móvil por sí mismo. "Tecnológico" = producto real y pulido, no una maqueta.

## 2026-06-30: Nada de connotación legal en la marca
**Error**: Nombre "El Juez" + icono de balanza + copy "veredicto/juez". El usuario NO quiere
relacionar el producto con lo legal.
**Regla**: Marca y UX sin términos legales (juez, veredicto, balanza, tribunal). El
razonamiento legal puede seguir en los prompts internos, pero NADA legal de cara al usuario.

## 2026-07-01: Producción falló por ignorar límites reales de plataforma y latencia
**Error**: En https://juez.vercel.app el análisis "no terminaba y lanzaba error". Tres causas:
(1) thinking MEDIUM tardaba ~107 s incluso con un PDF de 2 KB → los navegadores móviles
(Safari) cortan fetch a ~60 s y maxDuration=120 mataba PDFs reales; (2) prometíamos subir
15 MB pero Vercel rechaza cuerpos > 4.5 MB en el borde (413); (3) sin margen de duración.
**Causa raíz**: Probé solo en local/desktop, donde no existen ni el corte del navegador
móvil ni el límite de cuerpo de Vercel, y no medí la latencia como requisito.
**Regla**: Antes de dar por bueno un endpoint de IA para producción: (a) medir su latencia
p95 y mantenerla < 50 s si el cliente es un navegador móvil; (b) validar límites de la
plataforma de despliegue (body 4.5 MB en Vercel, maxDuration del plan); (c) probar contra
la URL de producción real, no solo local.

## Dirección definitiva (rediseño v3)
- **Nombre**: "Diagnóstico" (evaluación/diagnóstico del caso). Familia de marca: x-legal.
- **Tema**: CLARO, máxima legibilidad (texto grande, alto contraste) para personas mayores.
- **Estética**: elegante minimalista + glassmorphism (vidrio), luces de color, sombras
  suaves, bordes finos, motion. Moderno pero elegante.
- **Colores Utah (estado)**: azul marino #012D6A, dorado #FFC323, verde #1C9253 (alto),
  dorado (medio), rojo #E51837 (bajo), blanco.
- **Interacción**: un paso claro por pantalla, botones grandes "Siguiente/Atrás",
  "Paso X de Y", muy guiado y difícil de confundir.
- Backend intacto (Gemini 3.5-flash + 3.1-flash-lite, reintentos/fallback, rate-limit).
