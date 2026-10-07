import { describe, expect, it } from "vitest";
import { fromPosTicket, fromShopifyOrder, fromWooOrder } from "./adapters";
import { ingestPayloadSchema } from "./events";
import { hmac, verifySignature } from "./signature";

describe("firmas", () => {
  const body = JSON.stringify({ hola: "mundo" });

  it("valida firmas hex con prefijo y base64", () => {
    expect(verifySignature(body, `sha256=${hmac(body, "secreto")}`, "secreto")).toBe(true);
    expect(verifySignature(body, hmac(body, "secreto", "base64"), "secreto", "base64")).toBe(true);
  });

  it("rechaza firmas ausentes, alteradas o sin secreto", () => {
    expect(verifySignature(body, null, "secreto")).toBe(false);
    expect(verifySignature(body, `sha256=${hmac(body, "otro")}`, "secreto")).toBe(false);
    expect(verifySignature(body, `sha256=${hmac(body, "secreto")}`, undefined)).toBe(false);
  });
});

describe("traductores", () => {
  it("un pedido de Shopify se convierte en ventas online que bajan el stock", () => {
    const events = fromShopifyOrder({
      id: 1001,
      name: "#1001",
      created_at: "2026-09-29T10:00:00-05:00",
      line_items: [
        { sku: "ZAP-URB", quantity: 2 },
        { sku: null, quantity: 1 },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sku: "ZAP-URB", quantity: -2, channel: "online", type: "venta" });
  });

  it("WooCommerce ignora pedidos no pagados", () => {
    const order = { id: 5, date_created_gmt: "2026-09-29T15:00:00", status: "pending", line_items: [{ sku: "POL-BAS", quantity: 1 }] };
    expect(fromWooOrder(order)).toHaveLength(0);
    expect(fromWooOrder({ ...order, status: "processing" })[0]!.quantity).toBe(-1);
  });

  it("un ticket del POS con cantidad negativa es una devolución", () => {
    const events = fromPosTicket({ ticketId: "B-1", store: "LIM", closedAt: "2026-09-29T12:00:00-05:00", items: [{ sku: "ACC-GOR", qty: -1 }] });
    expect(events[0]).toMatchObject({ type: "devolucion", quantity: 1, channel: "tienda" });
  });

  it("la ingesta rechaza movimientos de cantidad cero", () => {
    const bad = ingestPayloadSchema.safeParse({
      events: [{ externalId: "x", source: "manual", type: "ajuste", sku: "ZAP-URB", quantity: 0, occurredAt: "2026-09-29T12:00:00-05:00" }],
    });
    expect(bad.success).toBe(false);
  });
});
