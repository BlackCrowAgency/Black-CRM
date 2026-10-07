import { z } from "zod";
import type { InventoryEvent } from "./events";

/**
 * Traductores de cada fuente al evento normalizado. Solo se usan los campos
 * necesarios para el stock; el resto del pedido queda en su sistema de origen.
 */

const shopifyOrder = z.object({
  id: z.union([z.number(), z.string()]),
  created_at: z.string(),
  name: z.string().optional(),
  source_name: z.string().optional(),
  line_items: z.array(z.object({ sku: z.string().nullable().optional(), quantity: z.number().int().positive() })),
});

/** Webhook `orders/create` de Shopify → ventas online (o en tienda si viene de Shopify POS). */
export function fromShopifyOrder(payload: unknown): InventoryEvent[] {
  const order = shopifyOrder.parse(payload);
  const channel = order.source_name === "pos" ? "tienda" : "online";
  return order.line_items
    .filter((li) => li.sku)
    .map((li, i) => ({
      externalId: `shopify:${order.id}:${i}`,
      source: "shopify" as const,
      type: "venta" as const,
      sku: li.sku!,
      location: "LIM",
      quantity: -li.quantity,
      channel,
      occurredAt: new Date(order.created_at).toISOString(),
      reference: order.name,
    }));
}

const wooOrder = z.object({
  id: z.number(),
  date_created_gmt: z.string(),
  status: z.string(),
  line_items: z.array(z.object({ sku: z.string().optional(), quantity: z.number().int().positive() })),
});

/** Webhook `order.created` de WooCommerce → ventas online (solo pedidos pagados o en proceso). */
export function fromWooOrder(payload: unknown): InventoryEvent[] {
  const order = wooOrder.parse(payload);
  if (!["processing", "completed", "on-hold"].includes(order.status)) return [];
  return order.line_items
    .filter((li) => li.sku)
    .map((li, i) => ({
      externalId: `woo:${order.id}:${i}`,
      source: "woocommerce" as const,
      type: "venta" as const,
      sku: li.sku!,
      location: "LIM",
      quantity: -li.quantity,
      channel: "online" as const,
      occurredAt: new Date(`${order.date_created_gmt}Z`).toISOString(),
      reference: `WC-${order.id}`,
    }));
}

const posTicket = z.object({
  ticketId: z.string(),
  store: z.string().default("LIM"),
  closedAt: z.string(),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int() })),
});

/** Ticket de un POS genérico → ventas en tienda (cantidades negativas son devoluciones). */
export function fromPosTicket(payload: unknown): InventoryEvent[] {
  const t = posTicket.parse(payload);
  return t.items.map((it, i) => ({
    externalId: `pos:${t.ticketId}:${i}`,
    source: "pos" as const,
    type: it.qty < 0 ? ("devolucion" as const) : ("venta" as const),
    sku: it.sku,
    location: t.store,
    quantity: -it.qty,
    channel: "tienda" as const,
    occurredAt: new Date(t.closedAt).toISOString(),
    reference: t.ticketId,
  }));
}
