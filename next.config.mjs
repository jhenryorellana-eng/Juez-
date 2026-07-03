/** @type {import('next').NextConfig} */

/**
 * Solo estos orígenes pueden embeber la app en un <iframe>:
 * - 'self': la propia app (juez.vercel.app)
 * - el panel de x-legal (la página /admin/demo vive en ese origen; los navegadores
 *   comparan frame-ancestors por ORIGEN, no por ruta, así que no es posible
 *   restringir a una ruta concreta con esta cabecera)
 * Nota: no se usa X-Frame-Options porque es incompatible con permitir un origen
 * externo específico; frame-ancestors la reemplaza en todos los navegadores actuales.
 */
const FRAME_ANCESTORS = "frame-ancestors 'self' https://x-legal.usalatinoprime.com";

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
