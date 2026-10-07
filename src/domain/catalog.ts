import type { ArtKind, Category, CategoryId, Location, LocationId, Product, ProductArt, ReplenishPolicy, Supplier } from "./types";

/**
 * Catálogo de Rumbo, tienda urbana ficticia que vende zapatillas, polos,
 * mochilas y accesorios en su local, por internet y a pedidos mayoristas.
 * Empresa, productos, proveedores y personas son inventados.
 */

export const COMPANY = {
  name: "Rumbo",
  legal: "Rumbo Urban Store S.A.C. (ficticia)",
  tagline: "Tienda urbana con venta online",
  currency: "PEN",
} as const;

/**
 * Ubicaciones. La demo opera una tienda con almacén; el modelo admite
 * sucursales (la versión real las activaría desde la configuración).
 */
export const LOCATIONS: Record<LocationId, Location> = {
  LIM: {
    id: "LIM",
    name: "Tienda Miraflores",
    short: "Miraflores",
    city: "Lima",
    kind: "Tienda con almacén",
    capacity: 2600,
    transitToLim: 0,
  },
  AQP: {
    id: "AQP",
    name: "Sucursal Arequipa",
    short: "Arequipa",
    city: "Arequipa",
    kind: "Sucursal (inactiva en la demo)",
    capacity: 1200,
    transitToLim: 1,
  },
  CUS: {
    id: "CUS",
    name: "Sucursal Cusco",
    short: "Cusco",
    city: "Cusco",
    kind: "Sucursal (inactiva en la demo)",
    capacity: 1200,
    transitToLim: 2,
  },
};

/** Ubicaciones activas en la demo. */
export const LOCATION_ORDER: readonly LocationId[] = ["LIM"];

export const SUPPLIERS: Record<string, Supplier> = {
  "SUP-CAL": {
    id: "SUP-CAL",
    name: "Calzados Pacífico",
    leadTime: 5,
    leadTimeSpread: 1,
    fillRate: 0.95,
    contact: "Patricia Vela",
    email: "pedidos@calzadospacifico.example",
    channel: "Correo",
    terms: "Crédito 30 días",
    origin: "Lima",
    minOrder: 1500,
  },
  "SUP-TEX": {
    id: "SUP-TEX",
    name: "Textil Andino",
    leadTime: 7,
    leadTimeSpread: 2,
    fillRate: 0.92,
    contact: "Gonzalo Ibárcena",
    email: "ventas@textilandino.example",
    channel: "WhatsApp Business",
    terms: "Crédito 30 días",
    origin: "Arequipa",
    minOrder: 1200,
  },
  "SUP-BOL": {
    id: "SUP-BOL",
    name: "Bolsos Lima",
    leadTime: 6,
    leadTimeSpread: 1,
    fillRate: 0.94,
    contact: "Rocío Mendívil",
    email: "pedidos@bolsoslima.example",
    channel: "Portal de proveedores",
    terms: "Contado",
    origin: "Lima",
    minOrder: 1000,
  },
  "SUP-ACC": {
    id: "SUP-ACC",
    name: "Accesorios Urbanos",
    leadTime: 4,
    leadTimeSpread: 1,
    fillRate: 0.96,
    contact: "Iván Ccori",
    email: "compras@accesoriosurbanos.example",
    channel: "Correo",
    terms: "Crédito 15 días",
    origin: "Lima",
    minOrder: 800,
  },
};

export const CATEGORIES: Record<CategoryId, Category> = {
  ZAP: { id: "ZAP", name: "Zapatillas", singular: "par", supplierId: "SUP-CAL" },
  POL: { id: "POL", name: "Polos", singular: "polo", supplierId: "SUP-TEX" },
  MOC: { id: "MOC", name: "Mochilas y bolsos", singular: "unidad", supplierId: "SUP-BOL" },
  ACC: { id: "ACC", name: "Accesorios", singular: "unidad", supplierId: "SUP-ACC" },
};

export const CATEGORY_ORDER: readonly CategoryId[] = ["ZAP", "POL", "MOC", "ACC"];

/** Producto protagonista: su historia se sigue durante toda la experiencia. */
export const HERO_SKU = "ZAP-URB";
export const HERO_LOC: LocationId = "LIM";

const AUTO: readonly [ReplenishPolicy, ReplenishPolicy, ReplenishPolicy] = ["auto", "auto", "auto"];
const NONE: readonly [ReplenishPolicy, ReplenishPolicy, ReplenishPolicy] = ["none", "none", "none"];

interface Def {
  sku: string;
  name: string;
  cost: number;
  price: number;
  pack: number;
  /** Ventas diarias típicas hoy. */
  rate: number;
  /** Días de stock al empezar el registro detallado. */
  cover: number;
  /** Tipo de ilustración y colores: principal, acento, fondo, detalle. */
  art: [ArtKind, string, string, string, string?];
  season?: Product["demand"]["season"];
  trend?: number;
  dormant?: number;
  surge?: { days: number; factor: number };
  stock?: number;
  /** false: nadie repuso este producto durante el periodo (genera las situaciones de la demo). */
  restock?: boolean;
}

function defs(category: CategoryId, list: Def[]): Product[] {
  const supplier = SUPPLIERS[CATEGORIES[category].supplierId]!;
  return list.map((d) => {
    const art: ProductArt = { kind: d.art[0], main: d.art[1], accent: d.art[2], bg: d.art[3], detail: d.art[4] };
    return {
      sku: d.sku,
      name: d.name,
      category,
      art,
      supplierId: supplier.id,
      unitCost: d.cost,
      price: d.price,
      packSize: d.pack,
      leadTime: supplier.leadTime,
      demand: {
        base: [d.rate, 0, 0],
        season: d.season ?? "none",
        trend: d.trend ?? 0,
        dormant: d.dormant ? [d.dormant, 0, 0] : undefined,
        surge: d.surge ? { ...d.surge, locs: ["LIM"] } : undefined,
      },
      startCover: [d.cover, 0, 0],
      startStock: d.stock !== undefined ? [d.stock, 0, 0] : undefined,
      policy: d.restock === false ? NONE : AUTO,
    };
  });
}

export const PRODUCTS: readonly Product[] = [
  ...defs("ZAP", [
    // Protagonista: su demanda de la historia está guionada en el generador.
    { sku: "ZAP-URB", name: "Zapatillas Urban", cost: 118, price: 219, pack: 10, rate: 2.6, cover: 20, art: ["sneaker", "#f4f1ea", "#1f9e6a", "#e7f2ea", "#2b2b2b"], restock: false },
    { sku: "ZAP-RUN", name: "Zapatillas Runner", cost: 156, price: 289, pack: 10, rate: 1.6, cover: 24, art: ["runner", "#3f6fd8", "#f5f5f2", "#e6edfa", "#ff7a45"] },
    { sku: "ZAP-CRT", name: "Zapatillas Court", cost: 104, price: 199, pack: 10, rate: 1.3, cover: 26, art: ["court", "#fbfaf6", "#c9a77c", "#f4ede2", "#2f3a33"] },
    { sku: "ZAP-TRL", name: "Zapatillas Trail", cost: 170, price: 309, pack: 10, rate: 0.9, cover: 22, art: ["trail", "#6b7178", "#ff8a3d", "#efede9", "#1f2328"] },
    { sku: "ZAP-KID", name: "Zapatillas Kids Jump", cost: 78, price: 149, pack: 10, rate: 0.8, cover: 30, art: ["sneaker", "#ff8fb1", "#ffd23f", "#fcebef", "#ffffff"] },
    { sku: "ZAP-SLD", name: "Sandalias Slide", cost: 36, price: 79, pack: 12, rate: 1.4, cover: 26, art: ["slide", "#2c2f33", "#e9e4da", "#ecebe8"], season: "summer", trend: 0.15 },
    { sku: "ZAP-BOT", name: "Botines Street", cost: 140, price: 259, pack: 6, rate: 0.25, cover: 220, art: ["boot", "#8a5a3b", "#d9b48f", "#f3ebe2", "#3a2a20"], season: "winter", restock: false },
    { sku: "ZAP-CNV", name: "Zapatillas Canvas", cost: 86, price: 169, pack: 10, rate: 1.1, cover: 28, art: ["hightop", "#d6453d", "#fbfaf6", "#faeae8", "#2b2b2b"] },
  ]),
  ...defs("POL", [
    { sku: "POL-BAS", name: "Polo Basic", cost: 21, price: 49, pack: 12, rate: 5.5, cover: 16, art: ["tee", "#fdfcf9", "#d8d3c8", "#efece5"] },
    { sku: "POL-CLA", name: "Polo Classic", cost: 26, price: 59, pack: 12, rate: 0.35, cover: 0, stock: 118, art: ["tee", "#25345a", "#3c4f80", "#e7eaf2"], restock: false },
    { sku: "POL-OVS", name: "Polo Oversize", cost: 30, price: 69, pack: 12, rate: 2.4, cover: 24, art: ["tee", "#9db59a", "#7f9a7c", "#ecf2ea"], surge: { days: 12, factor: 1.9 } },
    { sku: "POL-RAY", name: "Polo Rayas Marina", cost: 28, price: 65, pack: 12, rate: 1.5, cover: 24, art: ["tee-stripes", "#fbfaf6", "#2d4a8a", "#e8eef7"] },
    { sku: "POL-DRY", name: "Polo Dry Fit", cost: 34, price: 79, pack: 12, rate: 1.8, cover: 22, art: ["tee", "#21a3b5", "#1a8796", "#e4f4f6"], season: "summer" },
    { sku: "POL-HOD", name: "Polera Hoodie", cost: 62, price: 139, pack: 12, rate: 0.6, cover: 150, art: ["hoodie", "#8d9196", "#6f7378", "#eeeeed"], season: "winter", restock: false },
    { sku: "POL-EST", name: "Polo Estampado Andes", cost: 29, price: 69, pack: 12, rate: 1.2, cover: 26, art: ["tee-print", "#e9b949", "#2c3a33", "#faf1dc"] },
    { sku: "POL-MLG", name: "Polo Manga Larga", cost: 32, price: 75, pack: 12, rate: 0.9, cover: 30, art: ["longsleeve", "#6f7a4f", "#59633e", "#eff1e6"] },
  ]),
  ...defs("MOC", [
    { sku: "MOC-ESS", name: "Mochila Essential", cost: 72, price: 159, pack: 6, rate: 1.2, cover: 29.6, art: ["backpack", "#2f3640", "#e07a3f", "#edeef0"], restock: false },
    { sku: "MOC-ROL", name: "Mochila Roll Top", cost: 88, price: 189, pack: 6, rate: 0.8, cover: 28, art: ["rolltop", "#c4683f", "#2b2b2b", "#f7ebe3"] },
    { sku: "MOC-LAP", name: "Mochila Laptop Pro", cost: 104, price: 229, pack: 6, rate: 0.9, cover: 26, art: ["laptopbag", "#3d4a5c", "#9aa7b8", "#e8ecf1"] },
    { sku: "MOC-TOT", name: "Bolso Tote Canvas", cost: 38, price: 89, pack: 6, rate: 1.0, cover: 28, art: ["tote", "#e8dcc4", "#b98e5c", "#f6f0e4"] },
    { sku: "MOC-CAN", name: "Canguro Urban", cost: 24, price: 59, pack: 12, rate: 2.0, cover: 20, art: ["fannypack", "#1f9e6a", "#14563c", "#e3f3ea"] },
    { sku: "MOC-MIN", name: "Mochila Mini", cost: 52, price: 119, pack: 6, rate: 0.7, cover: 30, art: ["minibag", "#f2b8a2", "#d98c72", "#fbede7"] },
    { sku: "MOC-GYM", name: "Bolso Gym", cost: 60, price: 139, pack: 6, rate: 0.45, cover: 60, art: ["duffel", "#2b2f36", "#4f8cff", "#eaecf0"] },
  ]),
  ...defs("ACC", [
    { sku: "ACC-AUD", name: "Audífonos Move", cost: 92, price: 189, pack: 6, rate: 2.0, cover: 33.4, art: ["headphones", "#2a2d33", "#ff6b4a", "#f0ecec"], surge: { days: 8, factor: 1.2 }, restock: false },
    { sku: "ACC-GOR", name: "Gorra Classic", cost: 22, price: 59, pack: 12, rate: 2.2, cover: 22, art: ["cap", "#1d3557", "#f1faee", "#e7ecf3"] },
    { sku: "ACC-MED", name: "Medias Pack x3", cost: 13, price: 35, pack: 12, rate: 4.5, cover: 16, art: ["socks", "#f4f1ea", "#1f9e6a", "#edf3ee", "#e07a3f"] },
    { sku: "ACC-BOT", name: "Botella Térmica", cost: 30, price: 69, pack: 12, rate: 1.6, cover: 24, art: ["bottle", "#3fa7a0", "#e9f2f1", "#e2f2f1"] },
    { sku: "ACC-LEN", name: "Lentes Breeze", cost: 40, price: 99, pack: 12, rate: 1.2, cover: 26, art: ["sunglasses", "#1f1f1f", "#d9a441", "#f6efe0"], season: "summer" },
    { sku: "ACC-REL", name: "Reloj Pulse", cost: 120, price: 249, pack: 6, rate: 0.3, cover: 90, art: ["watch", "#2c2f33", "#b8c2cc", "#edeff1"], restock: false },
    { sku: "ACC-BIL", name: "Billetera Slim", cost: 18, price: 49, pack: 12, rate: 0, cover: 0, stock: 46, dormant: 41, art: ["wallet", "#7a4b2a", "#a46b43", "#f3eae1"], restock: false },
    { sku: "ACC-GRO", name: "Gorro de Lana", cost: 16, price: 45, pack: 12, rate: 0, cover: 0, stock: 64, dormant: 36, art: ["beanie", "#c0392b", "#f1e6d8", "#faeae6"], season: "winter", restock: false },
  ]),
];

export const PRODUCT_BY_SKU: ReadonlyMap<string, Product> = new Map(PRODUCTS.map((p) => [p.sku, p]));

export function productOf(sku: string): Product {
  const p = PRODUCT_BY_SKU.get(sku);
  if (!p) throw new Error(`Producto desconocido: ${sku}`);
  return p;
}

/** Personas y sistemas que registran movimientos (ficticios). */
export const ACTORS = {
  web: "Tienda online",
  posLim: "Caja de la tienda",
  b2b: "Ventas mayoristas",
  whLim: "Almacén · M. Quispe",
  rcvLim: "Almacén · R. Salazar",
  buyer: "Compras · A. Torres",
  blackCrm: "Black CRM",
  operator: "Tú",
  // Reservados para sucursales futuras.
  marketplace: "Marketplace",
  posAqp: "Caja Arequipa",
  posCus: "Caja Cusco",
  whAqp: "Almacén Arequipa",
  whCus: "Almacén Cusco",
} as const;

export const WAREHOUSE_ACTOR: Record<LocationId, string> = {
  LIM: ACTORS.whLim,
  AQP: ACTORS.whAqp,
  CUS: ACTORS.whCus,
};

/** Clientes mayoristas ficticios. */
export const B2B_CLIENTS = ["Club Deportivo Miraflores", "Colegio San Andrés", "Boutique Nativa", "Running Club Barranco", "Tienda Pukllay"] as const;
