import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { fromPosTicket, fromShopifyOrder, fromWooOrder } from "@/server/integrations/adapters";
import { ingestPayloadSchema, inventoryEventSchema, type InventoryEvent } from "@/server/integrations/events";
import { isLive } from "@/server/integrations/registry";
import { verifySignature } from "@/server/integrations/signature";

/**
 * Entrada única de movimientos desde otros sistemas:
 *   POST /api/webhooks/shopify      (X-Shopify-Hmac-Sha256, base64)
 *   POST /api/webhooks/woocommerce  (X-WC-Webhook-Signature, base64)
 *   POST /api/webhooks/pos          (X-Black-CRM-Signature: sha256=…)
 *   POST /api/webhooks/ingest       (X-Black-CRM-Signature: sha256=…) eventos ya normalizados
 *
 * Cada fuente se verifica, se traduce al evento normalizado y se valida.
 * En modo demo responde qué registraría, sin guardar nada.
 */

const MAX_BODY = 512 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const env = serverEnv();
  const body = await request.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });

  const config = {
    shopify: { header: "x-shopify-hmac-sha256", secret: env.SHOPIFY_WEBHOOK_SECRET, encoding: "base64" as const },
    woocommerce: { header: "x-wc-webhook-signature", secret: env.WOOCOMMERCE_WEBHOOK_SECRET, encoding: "base64" as const },
    pos: { header: "x-black-crm-signature", secret: env.POS_WEBHOOK_SECRET, encoding: "hex" as const },
    ingest: { header: "x-black-crm-signature", secret: env.BLACK_CRM_INGEST_SECRET, encoding: "hex" as const },
  }[source];
  if (!config) return NextResponse.json({ error: "Fuente desconocida" }, { status: 404 });
  if (!config.secret) return NextResponse.json({ error: "Integración no configurada" }, { status: 503 });
  if (!verifySignature(body, request.headers.get(config.header), config.secret, config.encoding)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let events: InventoryEvent[];
  try {
    const json: unknown = JSON.parse(body);
    if (source === "shopify") events = fromShopifyOrder(json);
    else if (source === "woocommerce") events = fromWooOrder(json);
    else if (source === "pos") events = fromPosTicket(json);
    else events = ingestPayloadSchema.parse(json).events;
    events = events.map((e) => inventoryEventSchema.parse(e));
  } catch {
    return NextResponse.json({ error: "Contenido no válido para esta fuente" }, { status: 422 });
  }

  // La persistencia (Postgres, idempotente por externalId) se activa con BLACK_CRM_DATA_SOURCE=postgres.
  return NextResponse.json({ mode: isLive(env) ? "live" : "demo", stored: false, accepted: events.length, events }, { status: 202 });
}
