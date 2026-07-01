# Lecciones del proyecto El Juez

## 2026-06-30: El diseño inicial fue "informe de escritorio", no app móvil
**Error**: Construí la UI como un sitio web de escritorio: multipantalla, secciones largas,
veredicto tipo reporte ancho. El usuario lo rechazó: quería algo "más directo, más mobile,
más interactivo".
**Causa raíz**: Asumí layout desktop por defecto y prioricé densidad de información sobre
la experiencia táctil/móvil. No confirmé el paradigma de interacción antes de construir.
**Regla**: Para experiencias de cara al usuario, definir PRIMERO el paradigma (mobile-first,
gesto principal, una acción por pantalla) y confirmarlo con mockups antes de codear.
Default a mobile-first salvo que se diga lo contrario.

## Decisión confirmada (rediseño)
- Interacción: **Tarjetas deslizables** (stories/Tinder): 1 pregunta por tarjeta, swipe para
  avanzar, barra de progreso segmentada arriba.
- Estética: **iOS limpio (claro)**: blanco, tipografía grande, espaciado amplio, gestos,
  colores de sistema iOS. Marco tipo teléfono con barra de estado falsa (9:41).
- Backend intacto: gemini-3.5-flash (veredicto, thinking MEDIUM) + gemini-3.1-flash-lite
  (preguntas, thinking MINIMAL).
