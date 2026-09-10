/** @type {import('next').NextConfig} */

/**
 * Solo estos orígenes pueden embeber la app en un <iframe>:
 * - 'self': la propia app (juez.vercel.app)
 * - el panel de ContyGo (la página /admin/demo vive en ese origen; los navegadores
 *   comparan frame-ancestors por ORIGEN, no por ruta, así que no es posible
 *   restringir a una ruta concreta con esta cabecera)
 *
 * Están los DOS dominios de ContyGo a propósito. Esa app cambió de
 * x-legal.usalatinoprime.com a contygo.app el 2026-09-09, y el host anterior
 * sigue sirviendo como alias mientras queden enlaces en circulación y PWA
 * instaladas ancladas a él.
 *
 * Quitar el anterior antes de tiempo no da un error visible: el navegador deja
 * el iframe EN BLANCO y no dice por qué. Por eso conviven hasta que ellos
 * retiren su alias (revisión prevista para 2026-12-09); entonces esta línea se
 * queda solo con https://contygo.app.
 *
 * Nota: no se usa X-Frame-Options porque es incompatible con permitir un origen
 * externo específico; frame-ancestors la reemplaza en todos los navegadores actuales.
 */
const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://contygo.app https://x-legal.usalatinoprime.com";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: FRAME_ANCESTORS },
        ],
      },
    ];
  },
};

export default nextConfig;
