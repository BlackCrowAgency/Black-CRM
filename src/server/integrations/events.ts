import { z } from "zod";

/**
 * Evento de inventario normalizado. Toda fuente (tienda online, POS, ERP,
 * almacén) se traduce a esta forma antes de llegar al libro de movimientos.
 */
export const inventoryEventSchema = z.object({
  /** Identificador único en la fuente (para no registrar dos veces lo mismo). */
  externalId: z.string().min(1).max(120),
  source: z.enum(["shopify", "woocommerce", "pos", "erp", "manual"]),
  type: z.enum(["venta", "recepcion", "devolucion", "ajuste", "transferencia"]),
  sku: z.string().min(1).max(64),
  location: z.string().min(1).max(32).default("LIM"),
  /** Variación de stock: negativa para salidas, positiva para entradas. */
  quantity: z
    .number()
    .int()
    .refine((n) => n !== 0, "La cantidad no puede ser 0"),
  channel: z.enum(["tienda", "online", "mayorista"]).optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  reference: z.string().max(120).optional(),
  note: z.string().max(240).optional(),
});

export type InventoryEvent = z.infer<typeof inventoryEventSchema>;

export const ingestPayloadSchema = z.object({
  events: z.array(inventoryEventSchema).min(1).max(500),
});
