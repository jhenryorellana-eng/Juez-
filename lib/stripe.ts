/**
 * Integración mínima con Stripe Checkout vía REST (sin SDK: solo dos llamadas).
 * Requiere STRIPE_SECRET_KEY en el entorno.
 */
import { INFORME_PRICE_USD } from "./stripe-shared";

export { INFORME_PRICE_USD };

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

interface CheckoutSession {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  metadata?: Record<string, string>;
}

async function stripeFetch(
  path: string,
  init?: { method?: string; body?: URLSearchParams },
): Promise<CheckoutSession> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");

  const res = await fetch(`https://api.stripe.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.body,
    cache: "no-store",
  });
  const data = (await res.json()) as CheckoutSession & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`STRIPE_ERROR: ${data.error?.message ?? res.status}`);
  }
  return data;
}

/** Crea la sesión de pago de $50 para un trabajo premium. */
export async function createCheckoutSession(params: {
  jobId: string;
  email: string;
  origin: string;
}): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(INFORME_PRICE_USD * 100),
    "line_items[0][price_data][product_data][name]":
      "Informe de Evaluación y Propuesta de Reforzamiento — USA Latino Prime",
    "line_items[0][price_data][product_data][description]":
      "Análisis profundo de tu expediente de asilo con informe profesional en PDF.",
    "metadata[jobId]": params.jobId,
    customer_email: params.email,
    success_url: `${params.origin}/pro/resultado?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.origin}/pro?cancelado=1`,
  });
  return stripeFetch("/v1/checkout/sessions", { method: "POST", body });
}

/** Recupera una sesión de Checkout para verificar el pago. */
export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new Error("INVALID_SESSION_ID");
  return stripeFetch(`/v1/checkout/sessions/${id}`);
}
