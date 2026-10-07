import "server-only";
import type { ServerEnv } from "../env";

/** Qué integraciones están listas (sin exponer valores). */
export function integrationStatus(env: ServerEnv) {
  return {
    dataSource: env.BLACK_CRM_DATA_SOURCE,
    database: Boolean(env.DATABASE_URL),
    shopify: Boolean(env.SHOPIFY_STORE_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN && env.SHOPIFY_WEBHOOK_SECRET),
    woocommerce: Boolean(env.WOOCOMMERCE_URL && env.WOOCOMMERCE_CONSUMER_KEY && env.WOOCOMMERCE_CONSUMER_SECRET && env.WOOCOMMERCE_WEBHOOK_SECRET),
    pos: Boolean(env.POS_WEBHOOK_SECRET),
    ingest: Boolean(env.BLACK_CRM_INGEST_SECRET),
    erp: env.ERP_PROVIDER === "odoo" ? Boolean(env.ODOO_URL && env.ODOO_DATABASE && env.ODOO_USERNAME && env.ODOO_API_KEY) : false,
    supplierOrders:
      env.SUPPLIER_ORDERS_CHANNEL === "email"
        ? Boolean(env.RESEND_API_KEY && env.PURCHASE_ORDERS_FROM_EMAIL)
        : env.SUPPLIER_ORDERS_CHANNEL === "webhook"
          ? Boolean(env.SUPPLIER_WEBHOOK_URL && env.SUPPLIER_WEBHOOK_SECRET)
          : false,
    forecast: env.FORECAST_PROVIDER === "external" ? Boolean(env.FORECAST_SERVICE_URL && env.FORECAST_SERVICE_TOKEN) : true,
    alerts: Boolean(env.ALERTS_WEBHOOK_URL),
  };
}

/** En modo demo nada sale del servidor, aunque haya credenciales cargadas. */
export const isLive = (env: ServerEnv) => env.BLACK_CRM_DATA_SOURCE === "postgres" && Boolean(env.DATABASE_URL);
