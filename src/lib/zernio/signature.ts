import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** X-Zernio-Signature = HMAC-SHA256 hex (minúsculas) del cuerpo crudo, con el secreto del endpoint. */
export function verifyZernioSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
