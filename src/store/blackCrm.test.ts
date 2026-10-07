import { describe, expect, it } from "vitest";
import { HERO_SKU } from "@/domain/catalog";
import { computeEngine, groupExtra } from "@/domain/engine";
import { viewOf } from "@/domain/simple";
import { HERO_KEY } from "@/domain/story";
import { useBlackCrm } from "./blackCrm";

const heroState = () => {
  const s = useBlackCrm.getState();
  const engine = computeEngine({ asOf: s.asOf, extra: groupExtra(s.extra), orders: s.orders, decisions: s.decisions });
  return viewOf(engine.items.get(HERO_KEY)!, engine.recByKey.get(HERO_KEY) ?? null).state;
};

describe("deshacer acciones del panel", () => {
  it("cancelar el pedido creado devuelve el producto a «requiere reposición»", () => {
    const before = useBlackCrm.getState().orders.length;
    expect(heroState()).toBe("reponer");

    const order = useBlackCrm.getState().prepareReplenishment(HERO_SKU, 40);
    expect(heroState()).toBe("en_camino");

    useBlackCrm.getState().cancelOrders([order.id]);
    expect(useBlackCrm.getState().orders.length).toBe(before);
    expect(useBlackCrm.getState().decisions[HERO_KEY]).toBeUndefined();
    expect(heroState()).toBe("reponer");
  });
});
