import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRecentMessages, type ZernioListedMessage } from "./client";

// El webhook de Zernio no trae el mensaje citado ("responder" de WhatsApp, Messenger e Instagram)
// ni las coordenadas de una ubicación: solo dice "📍 Location". Esos datos están en la lista de
// mensajes de la conversación (metadata), así que se piden aparte al recibir cada mensaje.

export type Ubicacion = { latitude: number; longitude: number; name?: string; address?: string };

function ubicacion(l: NonNullable<ZernioListedMessage["metadata"]>["location"]): Ubicacion | null {
  const lat = Number(l?.latitude);
  const lng = Number(l?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const u: Ubicacion = { latitude: lat, longitude: lng };
  if (l?.name) u.name = String(l.name).slice(0, 200);
  if (l?.address) u.address = String(l.address).slice(0, 300);
  return u;
}

/** Cita y ubicación de un mensaje de la lista de Zernio (null si no tiene). */
export function extrasDe(z: ZernioListedMessage): { citado: string | null; ubicacion: Ubicacion | null } {
  const citado = z.metadata?.quotedMessageId ? String(z.metadata.quotedMessageId).slice(0, 300) : null;
  return { citado, ubicacion: z.metadata?.location ? ubicacion(z.metadata.location) : null };
}

/** Guarda la cita y la ubicación (solo lo que trae; no borra nada). Devuelve si cambió algo. */
export async function guardarExtras(messageId: string, e: ReturnType<typeof extrasDe>): Promise<boolean> {
  const cambios: { reply_to_external_id?: string; location?: Ubicacion } = {};
  if (e.citado) cambios.reply_to_external_id = e.citado;
  if (e.ubicacion) cambios.location = e.ubicacion;
  if (!Object.keys(cambios).length) return false;
  const { error } = await createAdminClient().from("messages").update(cambios).eq("id", messageId);
  if (error) throw error;
  return true;
}

/**
 * Busca el mensaje recién llegado en la lista de Zernio y guarda su cita y su ubicación.
 * Si todavía no aparece en la lista, reintenta una vez.
 */
export async function completarMensaje(p: { messageId: string; conversacionExterna: string; cuenta: string; idsExternos: string[] }) {
  for (let intento = 0; intento < 2; intento++) {
    const lista = await listRecentMessages(p.conversacionExterna, p.cuenta, 20);
    const z = lista.find((x) => p.idsExternos.includes(x.id));
    if (z) return guardarExtras(p.messageId, extrasDe(z));
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}
