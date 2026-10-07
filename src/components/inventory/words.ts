import { productOf } from "@/domain/catalog";
import type { Movement } from "@/domain/types";

/** Motivo del movimiento de stock, en lenguaje de negocio. */
export function movementTitle(m: Movement): string {
  switch (m.type) {
    case "recepcion":
      return "Recepción de mercadería";
    case "devolucion":
      return "Devolución";
    case "ajuste":
      return m.dOnHand < 0 ? "Ajuste por merma" : "Ajuste de inventario";
    case "transferencia":
      return m.dOnHand > 0 ? "Llegó desde otra tienda" : "Enviado a otra tienda";
    case "reserva":
      return "Separado para un pedido";
    default:
      if (m.channel === "online") return "Venta online";
      if (m.channel === "mayorista") return "Pedido mayorista";
      return "Venta en tienda";
  }
}

/** «par/pares» para calzado, «unidad/unidades» para el resto. */
export function unitsWord(n: number, sku: string) {
  const abs = Math.abs(n);
  if (productOf(sku).category === "ZAP") return abs === 1 ? "par" : "pares";
  return abs === 1 ? "unidad" : "unidades";
}
