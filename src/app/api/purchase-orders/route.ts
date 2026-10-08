import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPurchaseOrder } from "@/domain/actions";
import { PRODUCT_BY_SKU, SUPPLIERS } from "@/domain/catalog";
import { getDataset } from "@/domain/generator";
import { NOW } from "@/domain/time";
import { serverEnv } from "@/server/env";
import { isLive } from "@/server/integrations/registry";
import { hmac } from "@/server/integrations/signature";

/**
 * «Preparar reposición» del lado servidor: arma el pedido al proveedor y,
 * solo en modo real con un canal configurado, lo envía (correo o webhook).
 * En la demo devuelve el pedido que se enviaría.
 */

const bodySchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive().max(10_000),
});

export async function POST(request: NextRequest) {
  const env = serverEnv();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Indica sku y quantity (entero positivo)" }, { status: 422 });
  const product = PRODUCT_BY_SKU.get(parsed.data.sku.toUpperCase());
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const order = createPurchaseOrder({ sku: product.sku, loc: "LIM", qty: parsed.data.quantity, asOf: NOW, orders: getDataset().purchaseOrders });
  const supplier = SUPPLIERS[product.supplierId]!;
  const payload = {
    orderId: order.id,
    supplier: { id: supplier.id, name: supplier.name, email: supplier.email },
    lines: [{ sku: product.sku, name: product.name, quantity: order.qty, unitCost: product.unitCost }],
    expectedAt: new Date(order.eta).toISOString(),
  };

  if (!isLive(env) || env.SUPPLIER_ORDERS_CHANNEL === "none") {
    return NextResponse.json({ mode: "demo", sent: false, order: payload }, { status: 201 });
  }

  if (env.SUPPLIER_ORDERS_CHANNEL === "webhook" && env.SUPPLIER_WEBHOOK_URL && env.SUPPLIER_WEBHOOK_SECRET) {
    const body = JSON.stringify(payload);
    const res = await fetch(env.SUPPLIER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Crow-CRM-Signature": `sha256=${hmac(body, env.SUPPLIER_WEBHOOK_SECRET)}` },
      body,
    });
    return NextResponse.json({ mode: "live", sent: res.ok, order: payload }, { status: res.ok ? 201 : 502 });
  }

  if (env.SUPPLIER_ORDERS_CHANNEL === "email" && env.RESEND_API_KEY && env.PURCHASE_ORDERS_FROM_EMAIL) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.PURCHASE_ORDERS_FROM_EMAIL,
        to: supplier.email,
        subject: `Pedido ${order.id}: ${product.name}`,
        text: `Hola ${supplier.contact},\n\nNecesitamos ${order.qty} de ${product.name} (${product.sku}).\nPedido ${order.id}.\n\nGracias.`,
      }),
    });
    return NextResponse.json({ mode: "live", sent: res.ok, order: payload }, { status: res.ok ? 201 : 502 });
  }

  return NextResponse.json({ error: "Canal de pedidos incompleto" }, { status: 503 });
}
