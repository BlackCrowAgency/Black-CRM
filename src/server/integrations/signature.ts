import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firmas HMAC-SHA256 de webhooks. Shopify y WooCommerce firman el cuerpo
 * crudo en base64; Crow CRM usa hex con prefijo `sha256=` para POS e ingesta.
 */

export function hmac(body: string, secret: string, encoding: "base64" | "hex" = "hex") {
  return createHmac("sha256", secret).update(body, "utf8").digest(encoding);
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifySignature(body: string, signature: string | null, secret: string | undefined, encoding: "base64" | "hex" = "hex") {
  if (!secret || !signature) return false;
  const expected = encoding === "hex" ? `sha256=${hmac(body, secret, "hex")}` : hmac(body, secret, "base64");
  return safeEqual(signature.trim(), expected);
}
