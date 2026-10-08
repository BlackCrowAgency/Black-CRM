import { describe, expect, it } from "vitest";
import { createPurchaseOrder, etaFor, receiptFor, toMovement } from "./actions";
import { analyze } from "./analysis";
import { HERO_SKU, PRODUCTS } from "./catalog";
import { computeEngine, groupExtra } from "./engine";
import { generateDataset, getDataset } from "./generator";
import { positionAt } from "./ledger";
import { alertsOf, productViews, projectStock, summaryOf, viewOf } from "./simple";
import { heroReaches, HERO_KEY } from "./story";
import { DAY, HOUR, NOW, STORY_START, limaParts } from "./time";
import { skuLoc } from "./types";

const ds = getDataset();
const baseEngine = () => computeEngine({ asOf: NOW, extra: groupExtra([]), orders: ds.purchaseOrders });

describe("dataset", () => {
  it("es determinista", () => {
    const again = generateDataset();
    expect(again.movements.length).toBe(ds.movements.length);
    expect(again.movements.at(-1)).toEqual(ds.movements.at(-1));
  });

  it("cada movimiento encadena el stock anterior y nunca queda negativo", () => {
    for (const [key, list] of ds.byKey) {
      let onHand = ds.opening.get(key)!.onHand;
      for (const m of list) {
        expect(m.onHandBefore).toBe(onHand);
        expect(m.onHandAfter).toBe(onHand + m.dOnHand);
        expect(m.onHandAfter).toBeGreaterThanOrEqual(0);
        expect(m.availableAfter).toBeGreaterThanOrEqual(0);
        onHand = m.onHandAfter;
      }
      expect(positionAt(key, NOW).onHand).toBe(onHand);
    }
  });

  it("los movimientos están en orden cronológico", () => {
    for (let i = 1; i < ds.movements.length; i++) expect(ds.movements[i]!.t).toBeGreaterThanOrEqual(ds.movements[i - 1]!.t);
  });
});

describe("historia de Zapatillas Urban", () => {
  it("baja de 42 a 11 pares pasando por los hitos de la historia", () => {
    expect(positionAt(HERO_KEY, STORY_START).available).toBe(42);
    expect(positionAt(HERO_KEY, NOW).available).toBe(11);
    const t35 = heroReaches(35);
    const t18 = heroReaches(18);
    expect(t35).toBeLessThan(t18);
    expect(t18).toBeLessThan(NOW);
  });

  it("vendió 24 esta semana, más rápido de lo normal, y se agotaría el viernes", () => {
    const v = viewOf(analyze(HERO_KEY, { asOf: NOW, orders: ds.purchaseOrders }), null);
    expect(v.soldWeek).toBe(24);
    expect(v.weekChange).toBeGreaterThan(0.25);
    expect(v.fast).toBe(true);
    expect(v.state).toBe("reponer");
    expect(limaParts(v.runOutAt!).weekday).toBe(5);
    expect(Math.round(v.daysLeft!)).toBe(3);
  });

  it("Crow CRM recomienda reponer 40 pares (4 cajas de 10)", () => {
    const rec = baseEngine().recByKey.get(HERO_KEY);
    expect(rec?.qty).toBe(40);
    expect(rec?.packs).toBe(4);
  });
});

describe("lenguaje simple", () => {
  const views = productViews(baseEngine());
  const byName = (name: string) => views.find((v) => v.product.name === name)!;

  it("clasifica los productos de ejemplo", () => {
    expect(["pocas", "reponer"]).toContain(byName("Mochila Essential").state);
    expect(byName("Mochila Essential").available).toBe(6);
    expect(byName("Audífonos Move").state).toBe("reponer");
    expect(byName("Polo Classic").state).toBe("demasiado");
    expect(byName("Billetera Slim").state).toBe("sin_ventas");
  });

  it("resume la tienda en cuatro cifras coherentes con los estados", () => {
    const s = summaryOf(views);
    expect(s.products).toBe(PRODUCTS.length);
    expect(s.runningOut).toBe(views.filter((v) => v.state === "reponer" || v.state === "agotado").length);
    expect(s.attention).toBeGreaterThanOrEqual(s.runningOut);
    expect(s.suggested).toBeGreaterThan(0);
  });

  it("ordena los avisos por urgencia", () => {
    const alerts = alertsOf(views);
    expect(alerts[0]!.kind).toBe("agotarse");
    expect(alerts.some((a) => a.kind === "rapido" && a.sku === HERO_SKU)).toBe(true);
  });
});

describe("lo que podría pasar", () => {
  it("con una promoción el stock se acaba antes y la reposición sugerida crece", () => {
    const key = skuLoc("MOC-ESS", "LIM");
    const a = analyze(key, { asOf: NOW, orders: ds.purchaseOrders });
    const normal = projectStock(a, 1);
    const promo = projectStock(a, 1.7);
    expect(promo.runOutAt!).toBeLessThan(normal.runOutAt!);
    const promoQty = analyze(key, { asOf: NOW, orders: ds.purchaseOrders, demandAdj: 1.7 }).suggestedQty;
    expect(promoQty).toBeGreaterThanOrEqual(a.suggestedQty);
  });
});

describe("acciones", () => {
  it("preparar reposición crea un pedido nuevo que no llega en domingo", () => {
    const order = createPurchaseOrder({ sku: HERO_SKU, loc: "LIM", qty: 40, asOf: NOW, orders: ds.purchaseOrders });
    expect(ds.purchaseOrders.some((o) => o.id === order.id)).toBe(false);
    expect(limaParts(order.eta).weekday).not.toBe(0);
    expect(limaParts(etaFor(NOW, 5)).weekday).not.toBe(0);
  });

  it("con el pedido en camino el producto deja de pedir reposición; al recibirlo vuelve a estar bien", () => {
    const order = createPurchaseOrder({ sku: HERO_SKU, loc: "LIM", qty: 40, asOf: NOW, orders: ds.purchaseOrders });
    const orders = [order, ...ds.purchaseOrders];
    const decisions = { [HERO_KEY]: { status: "orden_creada" as const, at: NOW, qty: 40, orderId: order.id } };
    const withOrder = computeEngine({ asOf: NOW, extra: groupExtra([]), orders, decisions });
    expect(viewOf(withOrder.items.get(HERO_KEY)!, withOrder.recByKey.get(HERO_KEY) ?? null).state).toBe("en_camino");

    const at = NOW + HOUR;
    const receipt = toMovement(receiptFor(order, at), "MV-test", positionAt(HERO_KEY, at));
    const received = orders.map((o) => (o.id === order.id ? { ...o, status: "recibida" as const } : o));
    const after = computeEngine({ asOf: at, extra: groupExtra([receipt]), orders: received });
    const v = viewOf(after.items.get(HERO_KEY)!, after.recByKey.get(HERO_KEY) ?? null);
    expect(v.available).toBe(51);
    expect(["bien", "rapido"]).toContain(v.state);
    expect(v.daysLeft!).toBeGreaterThan(10);
    expect(at - NOW).toBeLessThan(DAY);
  });
});
