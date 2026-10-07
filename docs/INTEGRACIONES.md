# Black CRM real: integraciones

La demo funciona sola con datos ficticios. Esta guía explica cómo pasar a un
sistema real sin cambiar la experiencia: los mismos componentes leen los mismos
datos, solo cambia de dónde vienen.

## Idea central

Todo cambio de stock es un **movimiento** (venta, llegada de reposición,
devolución, ajuste, traslado). El stock de un producto no se guarda «a mano»:
es la suma de sus movimientos. Por eso cualquier fuente —tienda online, POS,
almacén o ERP— solo necesita enviar movimientos.

```
Shopify / WooCommerce ─┐
POS de la tienda ──────┼─► /api/webhooks/[fuente] ─► evento normalizado ─► libro de movimientos (Postgres)
Almacén / ERP ─────────┘                                                         │
                                                                                 ▼
                          motor (src/domain) ─► estado simple, avisos, «lo que podría pasar», reposición
                                                                                 │
                                         interfaz · avisos al equipo · pedidos a proveedores
```

## Piezas ya preparadas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Configuración privada | `src/server/env.ts` | Valida todas las variables con zod; ninguna es obligatoria. |
| Evento normalizado | `src/server/integrations/events.ts` | Forma única de un movimiento externo (idempotente por `externalId`). |
| Traductores | `src/server/integrations/adapters.ts` | Shopify `orders/create`, WooCommerce `order.created`, ticket de POS. |
| Firmas | `src/server/integrations/signature.ts` | HMAC-SHA256 con comparación en tiempo constante. |
| Estado | `src/server/integrations/registry.ts` | Qué integraciones están listas (solo booleanos). |
| API | `src/app/api/*` | `health`, `webhooks/[source]`, `products/[sku]`, `purchase-orders`. |
| Motor | `src/domain/*` | Libro, pronóstico, reposición y lenguaje simple; se usa igual en servidor y navegador. |

## Rutas

- `GET /api/health` — modo (`demo`/`live`) y qué integraciones están configuradas.
- `POST /api/webhooks/shopify` — firma `X-Shopify-Hmac-Sha256` (base64 del cuerpo crudo).
- `POST /api/webhooks/woocommerce` — firma `X-WC-Webhook-Signature` (base64).
- `POST /api/webhooks/pos` — firma `X-Black-CRM-Signature: sha256=<hex>`. Cuerpo: `{ ticketId, store, closedAt, items: [{ sku, qty }] }` (qty negativa = devolución).
- `POST /api/webhooks/ingest` — eventos ya normalizados `{ events: [...] }`, misma firma. Útil para el almacén o el ERP.
- `GET /api/products/:sku` — lo mismo que muestra la ficha: disponibles, vendidas, estado, días que alcanza y reposición sugerida.
- `POST /api/purchase-orders` — `{ sku, quantity }`. En demo devuelve el pedido; en modo real lo envía por correo o webhook.

En modo demo todas responden sin guardar ni enviar nada.

## Variables

Todas están en `.env.example` con su explicación.

| Variable | Para qué sirve |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | URL canónica (SEO, Open Graph, sitemap). |
| `NEXT_PUBLIC_BLACK_CRM_MODE` | `demo` hoy. `live` queda reservado para que la interfaz cargue desde la API propia. |
| `NEXT_PUBLIC_CONTACT_URL`, `NEXT_PUBLIC_BLACKCROW_URL` | Enlaces del cierre. |
| `BLACK_CRM_DATA_SOURCE`, `DATABASE_URL` | Base de datos PostgreSQL del libro de movimientos. |
| `BLACK_CRM_TIMEZONE`, `BLACK_CRM_CURRENCY` | Cortes diarios y moneda del negocio. |
| `BLACK_CRM_ALLOWED_ORIGINS` | CORS para la API. |
| `BLACK_CRM_INGEST_SECRET` | Firma de `/api/webhooks/ingest`. |
| `SHOPIFY_*` | Catálogo, inventario y pedidos de Shopify. |
| `WOOCOMMERCE_*` | Catálogo y pedidos de WooCommerce. |
| `POS_WEBHOOK_SECRET` | Firma de los tickets del POS. |
| `ERP_PROVIDER`, `ODOO_*` | Sincronizar productos, costos y compras con Odoo. |
| `SUPPLIER_ORDERS_CHANNEL`, `RESEND_API_KEY`, `PURCHASE_ORDERS_FROM_EMAIL`, `SUPPLIER_WEBHOOK_*` | Enviar pedidos a proveedores. |
| `FORECAST_PROVIDER`, `FORECAST_SERVICE_*` | Pronóstico local o servicio externo. |
| `ALERTS_WEBHOOK_URL` | Avisos al equipo (Slack, Teams, WhatsApp). |
| `CRON_SECRET` | Tareas programadas (resumen diario). |

## Pasos para un negocio real

1. **Base de datos.** Crear el esquema de `docs/schema.sql` en PostgreSQL y definir `DATABASE_URL` y `BLACK_CRM_DATA_SOURCE=postgres`.
2. **Catálogo.** Importar productos desde la tienda online o el ERP (nombre, foto, categoría, precio, costo, proveedor, caja de compra). Las fotos reemplazan las ilustraciones de la demo en `ProductArt`.
3. **Stock inicial.** Un conteo por ubicación entra como movimiento de ajuste; desde ahí todo es incremental.
4. **Ventas.** Conectar los webhooks de Shopify o WooCommerce y el POS. Cada venta baja el stock en el momento.
5. **Llegadas.** El almacén confirma recepciones (botón «Marcar como recibida» o `/api/webhooks/ingest`).
6. **Proveedores.** Cargar tiempos de entrega y tamaño de caja; activar el canal de pedidos.
7. **Avisos.** Configurar `ALERTS_WEBHOOK_URL` y una tarea diaria (Vercel Cron) protegida con `CRON_SECRET`.
8. **Sucursales.** El motor ya admite varias ubicaciones (`LOCATION_ORDER` en `src/domain/catalog.ts`); se activan al cargar sus datos.

## Decisiones

- **Idempotencia:** cada evento trae `externalId`; un índice único evita registrar dos veces el mismo webhook.
- **Seguridad:** firmas HMAC verificadas en tiempo constante, límite de tamaño de cuerpo, secretos solo en el servidor (`server-only`).
- **Pronóstico explicable:** Holt-Winters amortiguado con estacionalidad semanal y perfil anual. Puede reemplazarse por un servicio externo con la misma salida.
- **Lenguaje simple:** `src/domain/simple.ts` traduce cobertura, punto de reorden y lead time a «quedan pocas», «podría agotarse el viernes» y «reponer 40».
