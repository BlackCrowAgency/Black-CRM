import { NextResponse, type NextRequest } from "next/server";
import { PRODUCT_BY_SKU } from "@/domain/catalog";
import { computeEngine, groupExtra } from "@/domain/engine";
import { getDataset } from "@/domain/generator";
import { viewOf } from "@/domain/simple";
import { NOW } from "@/domain/time";
import { skuLoc } from "@/domain/types";

/**
 * Resumen sencillo de un producto: lo mismo que muestra su ficha.
 * Usa el mismo motor que la interfaz, así que las cifras coinciden.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = PRODUCT_BY_SKU.get(sku.toUpperCase());
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const engine = computeEngine({ asOf: NOW, extra: groupExtra([]), orders: getDataset().purchaseOrders });
  const key = skuLoc(product.sku, "LIM");
  const v = viewOf(engine.items.get(key)!, engine.recByKey.get(key) ?? null);

  return NextResponse.json({
    sku: product.sku,
    name: product.name,
    price: product.price,
    available: v.available,
    soldThisWeek: v.soldWeek,
    soldThisMonth: v.soldMonth,
    state: v.state,
    daysLeft: v.daysLeft === null ? null : Math.round(v.daysLeft * 10) / 10,
    runOutAt: v.runOutAt ? new Date(v.runOutAt).toISOString() : null,
    suggestedRestock: v.rec && v.rec.qty > 0 ? { quantity: v.rec.qty, supplierId: v.rec.supplierId } : null,
    asOf: new Date(NOW).toISOString(),
  });
}
