import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { CROW_LOGOTYPE, CROW_MARK } from "@/components/chrome/marks";
import { HERO_SKU } from "@/domain/catalog";
import { computeEngine, groupExtra } from "@/domain/engine";
import { fmtMoney, fmtPct } from "@/domain/format";
import { getDataset } from "@/domain/generator";
import { revenueByDay } from "@/domain/growth";
import { salesSummary } from "@/domain/perf";
import { alertsOf, productViews, whenText } from "@/domain/simple";
import { NOW } from "@/domain/time";

export const alt = "Crow CRM, el CRM que controla tu inventario: panel con stock, alertas y crecimiento de ventas, impulsado por IA.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  bg: "#f6f7fa",
  ink: "#13152c",
  ink2: "#3d4159",
  ink3: "#62667f",
  line: "#e5e7ee",
  iris: "#5b5bd6",
  irisSoft: "#eeeffd",
  violet: "#6e56cf",
  violetInk: "#5b45b8",
  violetSoft: "#f1edfd",
  teal: "#0b7d70",
  tealSoft: "#ddf4ef",
  orange: "#f76b15",
  orangeInk: "#c2470a",
  cell: "#e6e7ef",
};

/** Estrella de cuatro puntas (sello de la IA). */
function Spark({ size: s, color }: { size: number; color: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      <path d="M12 2c.6 4.6 2.4 6.9 7 7.9-4.6 1-6.4 3.3-7 8.1-.6-4.8-2.4-7.1-7-8.1 4.6-1 6.4-3.3 7-7.9z" fill={color} />
    </svg>
  );
}

/**
 * Imagen para compartir (1200 × 630), generada en el build: el titular con la
 * tipografía del sitio y un adelanto del panel con datos reales del motor.
 */
export default async function OpengraphImage() {
  const [display, text, crow] = await Promise.all([
    readFile(join(process.cwd(), "src/app/og/InstrumentSans-SemiBoldCondensed.ttf")),
    readFile(join(process.cwd(), "src/app/og/InstrumentSans-Medium.ttf")),
    readFile(join(process.cwd(), "public/brand/black-crow-icon.svg")),
  ]);

  const ds = getDataset();
  const engine = computeEngine({ asOf: NOW, extra: groupExtra([]), orders: ds.purchaseOrders });
  const views = productViews(engine);
  const hero = views.find((v) => v.sku === HERO_SKU)!;
  const sales = salesSummary(ds.movements, NOW);
  const alerts = alertsOf(views).length;
  const days = revenueByDay(ds.movements, NOW, 181).slice(0, -1);
  const months = [0, 1, 2, 3, 4, 5].map((m) => days.slice(m * 30, m * 30 + 30).reduce((a, d) => a + d.revenue, 0));
  const growth = months[0]! > 0 ? months[5]! / months[0]! - 1 : 0;
  const maxMonth = Math.max(...months);
  const delta7 = sales.revenuePrev7 > 0 ? sales.revenue7 / sales.revenuePrev7 - 1 : 0;
  const rec = hero.rec?.qty ?? 40;
  const crowSrc = `data:image/svg+xml;base64,${crow.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        fontFamily: "Instrument",
        color: C.ink,
        backgroundColor: C.bg,
        backgroundImage:
          "radial-gradient(circle at 82% 22%, rgba(91,91,214,0.22), rgba(91,91,214,0) 52%), radial-gradient(circle at 8% 100%, rgba(110,86,207,0.14), rgba(110,86,207,0) 45%)",
        overflow: "hidden",
      }}
    >
      {/* Columna de texto */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, padding: "64px 0 60px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width={(44 * CROW_MARK.width) / CROW_MARK.height} height={44} viewBox={`0 0 ${CROW_MARK.width} ${CROW_MARK.height}`}>
            <path d={CROW_MARK.d} fill={C.ink} fillRule="evenodd" />
          </svg>
          <svg width={(25 * CROW_LOGOTYPE.width) / CROW_LOGOTYPE.height} height={25} viewBox={`0 0 ${CROW_LOGOTYPE.width} ${CROW_LOGOTYPE.height}`}>
            <path d={CROW_LOGOTYPE.d} fill={C.ink} fillRule="evenodd" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Display", fontSize: 80, lineHeight: 0.98, letterSpacing: -3 }}>El CRM que controla tu inventario.</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              alignSelf: "flex-start",
              marginTop: 30,
              padding: "8px 16px 8px 13px",
              borderRadius: 999,
              border: "1px solid rgba(110,86,207,0.28)",
              backgroundColor: C.violetSoft,
              color: C.violetInk,
              fontSize: 22,
            }}
          >
            <Spark size={20} color={C.violet} />
            Impulsado por IA
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.ink3, fontSize: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse solo admite <img> */}
          <img src={crowSrc} width={30} height={35} alt="" />
          Un producto de Black Crow
        </div>
      </div>

      {/* Adelanto del panel: sale por el borde, como en la escena */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 610,
          top: 72,
          width: 640,
          padding: 22,
          gap: 16,
          borderRadius: 28,
          border: `1px solid ${C.line}`,
          backgroundColor: "#ffffff",
          boxShadow: "0 40px 90px -30px rgba(44,44,120,0.45)",
        }}
      >
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 18px", borderRadius: 16, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", color: C.ink3, fontSize: 17 }}>Ventas de 7 días</div>
            <div style={{ display: "flex", fontFamily: "Display", fontSize: 34, letterSpacing: -1 }}>{fmtMoney(sales.revenue7)}</div>
            <div style={{ display: "flex", color: C.teal, fontSize: 15 }}>{fmtPct(delta7, true)} frente a la semana anterior</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 170, padding: "14px 18px", borderRadius: 16, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", color: C.ink3, fontSize: 17 }}>Alertas activas</div>
            <div style={{ display: "flex", fontFamily: "Display", fontSize: 34, color: C.orangeInk }}>{alerts}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 300, padding: "16px 18px", borderRadius: 16, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", fontSize: 18 }}>{hero.product.name}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 6 }}>
              <div style={{ display: "flex", fontFamily: "Display", fontSize: 58, lineHeight: 1, letterSpacing: -2 }}>{hero.available}</div>
              <div style={{ display: "flex", color: C.ink2, fontSize: 16, paddingBottom: 6 }}>pares disponibles</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12, width: 262 }}>
              {Array.from({ length: 42 }, (_, i) => (
                <div key={i} style={{ width: 15, height: 15, borderRadius: 3, backgroundColor: i < hero.available ? C.orange : C.cell }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "16px 18px", borderRadius: 16, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 18 }}>Ventas mensuales</div>
              <div style={{ display: "flex", padding: "3px 10px", borderRadius: 999, backgroundColor: C.tealSoft, color: C.teal, fontSize: 16 }}>{fmtPct(growth, true)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 120, marginTop: 16 }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flex: 1,
                    height: `${Math.round((m / maxMonth) * 100)}%`,
                    borderRadius: "7px 7px 3px 3px",
                    backgroundColor: i === months.length - 1 ? C.iris : "#d6d6f7",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* La IA, flotando sobre el panel */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 560,
          top: 404,
          width: 470,
          padding: "18px 20px",
          gap: 8,
          borderRadius: 20,
          border: "1px solid rgba(110,86,207,0.3)",
          backgroundColor: "#ffffff",
          boxShadow: "0 30px 70px -24px rgba(91,69,184,0.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.violetInk, fontSize: 18 }}>
          <Spark size={18} color={C.violet} />
          Crow CRM IA
        </div>
        <div style={{ display: "flex", fontSize: 20, lineHeight: 1.35, color: C.ink }}>
          {`Repón ${rec} pares de ${hero.product.name}: ${hero.runOutAt ? `se agota ${whenText(hero.runOutAt, NOW)}` : "el stock está bajo"}.`}
        </div>
        <div style={{ display: "flex", alignSelf: "flex-start", marginTop: 4, padding: "8px 14px", borderRadius: 10, backgroundColor: C.iris, color: "#fff", fontSize: 16 }}>
          Crear pedido de {rec}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Display", data: display, weight: 600, style: "normal" },
        { name: "Instrument", data: text, weight: 500, style: "normal" },
      ],
    },
  );
}
