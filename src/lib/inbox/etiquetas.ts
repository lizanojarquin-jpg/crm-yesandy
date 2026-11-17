import type { Database } from "@/lib/supabase/database.types";

export type Etapa = Database["public"]["Enums"]["contact_stage"];
export type Plataforma = Database["public"]["Enums"]["channel_platform"];

export const ETAPAS: { valor: Etapa; texto: string }[] = [
  { valor: "new", texto: "Nuevo" },
  { valor: "advising", texto: "Asesorando" },
  { valor: "ready_for_seller", texto: "Listo para vendedora" },
  { valor: "order_confirmed", texto: "Pedido confirmado" },
  { valor: "payment_received", texto: "Pago recibido" },
  { valor: "shipped", texto: "Enviado" },
  { valor: "delivered", texto: "Entregado" },
  { valor: "lost", texto: "Perdido" },
  { valor: "no_response", texto: "Sin respuesta" },
];

export const textoEtapa = (e: Etapa) => ETAPAS.find((x) => x.valor === e)?.texto ?? e;

export const PLATAFORMAS: { valor: Plataforma; texto: string; corto: string; color: string }[] = [
  { valor: "whatsapp", texto: "WhatsApp", corto: "WA", color: "#1fa855" },
  { valor: "facebook", texto: "Facebook", corto: "FB", color: "#1877f2" },
  { valor: "instagram", texto: "Instagram", corto: "IG", color: "#d62976" },
  { valor: "tiktok", texto: "TikTok", corto: "TT", color: "#111111" },
];

export const plataforma = (p: Plataforma) => PLATAFORMAS.find((x) => x.valor === p) ?? PLATAFORMAS[0];

/** Nombre visible de un contacto aunque no tenga nombre guardado. */
export function nombreContacto(c: { name?: string | null; phone?: string | null } | null, handle?: string | null) {
  // En WhatsApp el "usuario" es el número de teléfono: va sin @.
  const usuario = handle ? (/^\+?\d[\d\s-]*$/.test(handle) ? handle : `@${handle}`) : null;
  return c?.name?.trim() || c?.phone || usuario || "Sin nombre";
}

export function iniciales(nombre: string) {
  const partes = nombre.replace(/^@/, "").split(/\s+/).filter(Boolean);
  // Array.from respeta emojis (no los parte a la mitad).
  const letra = (s?: string) => (s ? Array.from(s)[0] : "");
  if (nombre.startsWith("+")) return "#";
  return ((letra(partes[0]) || "?") + letra(partes[1])).toUpperCase();
}
