"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { computeEngine, groupExtra, type Engine } from "@/domain/engine";
import type { ExtraByKey } from "@/domain/ledger";
import { alertsOf, productViews, summaryOf, type ProductView, type SimpleAlert, type Summary } from "@/domain/simple";
import { getDataset } from "@/domain/generator";
import { salesSummary, type SalesSummary } from "@/domain/perf";
import type { Movement } from "@/domain/types";
import { useBlackCrm } from "@/store/blackCrm";

interface EngineContextValue {
  engine: Engine;
  views: ProductView[];
  alerts: SimpleAlert[];
  summary: Summary;
  extra: readonly Movement[];
  extraByKey: ExtraByKey;
  /** Histórico + movimientos en vivo, en orden cronológico. */
  moves: readonly Movement[];
  sales: SalesSummary;
}

const EngineContext = createContext<EngineContextValue | null>(null);

/**
 * Un único cálculo compartido por todas las piezas de la página. El reloj
 * en vivo no recalcula nada por sí solo: solo los eventos y las acciones.
 */
export function EngineProvider({ children }: { children: ReactNode }) {
  const asOf = useBlackCrm((s) => s.asOf);
  const extra = useBlackCrm((s) => s.extra);
  const orders = useBlackCrm((s) => s.orders);
  const decisions = useBlackCrm((s) => s.decisions);
  const value = useMemo(() => {
    const extraByKey = groupExtra(extra);
    const engine = computeEngine({ asOf, extra: extraByKey, orders, decisions });
    const views = productViews(engine);
    const moves = extra.length ? [...getDataset().movements, ...extra] : getDataset().movements;
    return { engine, views, alerts: alertsOf(views), summary: summaryOf(views), extra, extraByKey, moves, sales: salesSummary(moves, asOf) };
  }, [asOf, extra, orders, decisions]);
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error("useEngine debe usarse dentro de <EngineProvider>");
  return ctx;
}
