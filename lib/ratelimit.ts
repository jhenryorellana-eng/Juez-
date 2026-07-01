/**
 * Rate limiter en memoria (best-effort) para proteger los endpoints de IA del abuso/costo.
 *
 * NOTA: en serverless cada instancia tiene su propia memoria, así que esto es una primera
 * línea de defensa, no una garantía global. Para límites robustos y compartidos usar
 * Upstash Redis o Vercel KV (ver README → producción).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Extrae una IP aproximada del cliente desde las cabeceras (Vercel setea x-forwarded-for). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateResult {
  ok: boolean;
  retryAfter: number; // segundos
}

export function rateLimit(
  key: string,
  max: number,
  windowMs = 60_000,
): RateResult {
  const now = Date.now();

  // Limpieza ocasional de entradas expiradas para no crecer sin límite.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true, retryAfter: 0 };
}
