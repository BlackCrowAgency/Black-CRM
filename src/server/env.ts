import "server-only";
import { z } from "zod";

/**
 * Configuración privada (solo servidor). Todas las variables son opcionales:
 * sin valores, Crow CRM funciona como demo con datos ficticios y las rutas de
 * integración responden en modo de prueba sin enviar nada a terceros.
 * Detalle de cada variable en docs/INTEGRACIONES.md y .env.example.
 */

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = z.preprocess(blank, z.string().trim().optional());
const optionalUrl = z.preprocess(blank, z.url().optional());

const schema = z.object({
  CROW_CRM_DATA_SOURCE: z.preprocess(blank, z.enum(["demo", "postgres"]).default("demo")),
  DATABASE_URL: optional,
  CROW_CRM_TIMEZONE: z.preprocess(blank, z.string().default("America/Lima")),
  CROW_CRM_CURRENCY: z.preprocess(blank, z.string().length(3).default("PEN")),
  CROW_CRM_ALLOWED_ORIGINS: optional,
  CROW_CRM_INGEST_SECRET: optional,

  SHOPIFY_STORE_DOMAIN: optional,
  SHOPIFY_ADMIN_ACCESS_TOKEN: optional,
  SHOPIFY_WEBHOOK_SECRET: optional,
  SHOPIFY_LOCATION_ID: optional,

  WOOCOMMERCE_URL: optionalUrl,
  WOOCOMMERCE_CONSUMER_KEY: optional,
  WOOCOMMERCE_CONSUMER_SECRET: optional,
  WOOCOMMERCE_WEBHOOK_SECRET: optional,

  POS_WEBHOOK_SECRET: optional,

  ERP_PROVIDER: z.preprocess(blank, z.enum(["none", "odoo"]).default("none")),
  ODOO_URL: optionalUrl,
  ODOO_DATABASE: optional,
  ODOO_USERNAME: optional,
  ODOO_API_KEY: optional,

  SUPPLIER_ORDERS_CHANNEL: z.preprocess(blank, z.enum(["none", "email", "webhook"]).default("none")),
  RESEND_API_KEY: optional,
  PURCHASE_ORDERS_FROM_EMAIL: optional,
  SUPPLIER_WEBHOOK_URL: optionalUrl,
  SUPPLIER_WEBHOOK_SECRET: optional,

  FORECAST_PROVIDER: z.preprocess(blank, z.enum(["local", "external"]).default("local")),
  FORECAST_SERVICE_URL: optionalUrl,
  FORECAST_SERVICE_TOKEN: optional,

  ALERTS_WEBHOOK_URL: optionalUrl,
  CRON_SECRET: optional,
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function serverEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (source === process.env && cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Configuración de servidor inválida: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
