/**
 * Geometría de la escena: el panel de Black CRM en un espacio de diseño fijo
 * (1280 × 820) y una «cámara» por capítulo. La cámara se interpola con el
 * scroll y se aplica como una sola transformación 3D sobre el panel.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEVICE = { w: 1280, h: 820 };

const KPI_W = (1164 - 3 * 16) / 4;

export const MODULES = {
  topbar: { x: 0, y: 0, w: 1280, h: 60 },
  sidebar: { x: 0, y: 60, w: 76, h: 760 },
  kpi0: { x: 96, y: 80, w: KPI_W, h: 96 },
  kpi1: { x: 96 + (KPI_W + 16), y: 80, w: KPI_W, h: 96 },
  kpi2: { x: 96 + (KPI_W + 16) * 2, y: 80, w: KPI_W, h: 96 },
  kpi3: { x: 96 + (KPI_W + 16) * 3, y: 80, w: KPI_W, h: 96 },
  stock: { x: 96, y: 192, w: 380, h: 292 },
  forecast: { x: 492, y: 192, w: 768, h: 292 },
  alert: { x: 96, y: 500, w: 380, h: 300 },
  order: { x: 492, y: 500, w: 372, h: 300 },
  growth: { x: 880, y: 500, w: 380, h: 300 },
} satisfies Record<string, Box>;

export type ModuleId = keyof typeof MODULES;

/** Profundidad de cada pieza en la vista despiezada de la apertura. */
export const DEPTH: Record<ModuleId, number> = {
  topbar: 40,
  sidebar: 24,
  kpi0: 60,
  kpi1: 66,
  kpi2: 72,
  kpi3: 78,
  stock: 120,
  forecast: 90,
  alert: 150,
  order: 170,
  growth: 100,
};

/** Pieza protagonista de cada capítulo (la apertura y el cierre muestran el panel entero). */
export const FOCUS: (ModuleId | null)[] = [null, "stock", "alert", "forecast", "order", "growth"];

export interface Camera {
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  s: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Condición del diseño apilado (texto abajo, panel arriba). Es la misma que
 * usan las media queries de cinema.module.css: móviles en vertical y tabletas
 * en vertical. Tabletas y móviles en horizontal usan el diseño lado a lado.
 */
export const STACKED_QUERY = "(max-width: 639px), (max-width: 999px) and (max-aspect-ratio: 13/10)";

/** Medidas del escenario: la cámara las usa para encuadrar y el CSS las recibe como variables. */
export interface StageLayout {
  stacked: boolean;
  header: number;
  /** Alto reservado abajo para la barra de capítulos. */
  railH: number;
  /** Columna de texto (lado a lado). */
  capX: number;
  capW: number;
  /** Alto del bloque de texto (apilado) y el del capítulo final, que lleva el asistente. */
  capH: number;
  capHFinal: number;
  /** Alto máximo del capítulo final antes de desplazarse por dentro. */
  capMaxH: number;
  /** Margen derecho seguro (muesca). */
  safeRight: number;
}

const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** `safe`: márgenes de la muesca en horizontal (env(safe-area-inset-left/right)). */
export function stageLayout(w: number, h: number, header: number, stacked: boolean, safe = { left: 0, right: 0 }): StageLayout {
  const railH = h < 560 ? 58 : 78;
  if (stacked) {
    const capH = clampN(h * 0.34, 190, 330);
    // En tabletas el asistente cabe en algo más de media pantalla; en móviles necesita casi tres cuartos.
    const capHFinal = w >= 640 ? clampN(h * 0.55, 360, 580) : clampN(h * 0.74, 360, 640);
    return { stacked, header, railH, capX: 0, capW: w, capH, capHFinal, capMaxH: capHFinal - railH - 12, safeRight: safe.right };
  }
  const capX = clampN(w * 0.05, 20, 80) + safe.left;
  const capW = w >= 1000 ? clampN(w * 0.34, 340, 480) : clampN(w * 0.42, 260, 380);
  return { stacked, header, railH, capX, capW, capH: h, capHFinal: h, capMaxH: h - header - railH - 16, safeRight: safe.right };
}

/** Zona libre para el panel: a la derecha del texto (lado a lado) o encima del texto (apilado). */
export function regionOf(w: number, h: number, L: StageLayout, final = false): Region {
  if (L.stacked) {
    const capH = final ? L.capHFinal : L.capH;
    return { x0: 10, y0: L.header + 8, x1: w - 10, y1: Math.max(L.header + 120, h - capH + 24) };
  }
  const wide = w >= 1000;
  return { x0: L.capX + L.capW + (wide ? 40 : 20), y0: L.header + 12, x1: w - (wide ? 32 : 14) - L.safeRight, y1: h - L.railH };
}

export function camerasFor(w: number, h: number, L: StageLayout): Camera[] {
  const frame = (r: Region) => {
    const rw = r.x1 - r.x0;
    const rh = r.y1 - r.y0;
    return { rw, rh, cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, fit: Math.min((rw * 0.97) / DEVICE.w, (rh * 0.97) / DEVICE.h) };
  };
  const main = frame(regionOf(w, h, L));
  const close = frame(regionOf(w, h, L, true));
  const focus = (b: Box, k = 0.9, part = 1, at = 0.5): Pick<Camera, "fx" | "fy" | "s"> => ({
    fx: b.x + b.w * at,
    fy: b.y + b.h / 2,
    s: Math.min((main.rw * k) / (b.w * part), (main.rh * 0.86) / b.h, 1.55),
  });
  const base = { cx: main.cx, cy: main.cy };
  // En móviles angostos el pronóstico se encuadra en el tramo que importa: de hoy al quiebre.
  const narrow = L.stacked && w < 600;
  return [
    { ...base, fx: DEVICE.w / 2, fy: DEVICE.h / 2, s: main.fit * (L.stacked ? 1.25 : 0.98), rx: 50, ry: 0, rz: -30 },
    { ...base, ...focus(MODULES.stock), rx: 4, ry: -12, rz: 0 },
    { ...base, ...focus(MODULES.alert), rx: 4, ry: 12, rz: 0 },
    { ...base, ...(narrow ? focus(MODULES.forecast, 0.94, 0.62, 0.68) : focus(MODULES.forecast, 0.86)), rx: 6, ry: 6, rz: 0 },
    { ...base, ...focus(MODULES.order), rx: 4, ry: 12, rz: 0 },
    { cx: close.cx, cy: close.cy, fx: DEVICE.w / 2, fy: DEVICE.h / 2, s: close.fit, rx: 0, ry: 0, rz: 0 },
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Cámara entre dos capítulos; a mitad de camino se aleja un poco para mostrar hacia dónde va. */
export function cameraAt(cams: Camera[], p: number): Camera {
  const i = Math.max(0, Math.min(cams.length - 1, Math.floor(p)));
  const j = Math.min(cams.length - 1, i + 1);
  const t = Math.max(0, Math.min(1, p - i));
  const a = cams[i]!;
  const b = cams[j]!;
  const dolly = i === j ? 1 : 1 - 0.14 * Math.sin(Math.PI * t);
  return {
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    fx: lerp(a.fx, b.fx, t),
    fy: lerp(a.fy, b.fy, t),
    s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), t)) * dolly,
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    rz: lerp(a.rz, b.rz, t),
  };
}

export function transformOf(c: Camera) {
  return `translate3d(${c.cx.toFixed(1)}px, ${c.cy.toFixed(1)}px, 0) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) rotateZ(${c.rz.toFixed(2)}deg) scale(${c.s.toFixed(4)}) translate3d(${(-c.fx).toFixed(1)}px, ${(-c.fy).toFixed(1)}px, 0)`;
}
