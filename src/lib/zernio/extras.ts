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

// ---------------------------------------------------------------------
// Anuncio de origen (Click to WhatsApp, Messenger e Instagram)
// ---------------------------------------------------------------------
// Este sí viene en el webhook (metadata.referral), solo en el primer mensaje después de tocar el
// anuncio. La lista de mensajes de Zernio no lo trae: si no se guarda al llegar, se pierde.

export type Anuncio = {
  id: string | null;
  titulo: string | null;
  texto: string | null;
  /** Ruta en el bucket "attachments" (la miniatura de Facebook caduca en unos días). */
  imagen: string | null;
  imagen_original: string | null;
  /** Abre el anuncio o la publicación. */
  enlace: string | null;
  video: string | null;
  tipo: "image" | "video" | null;
};

type Referral = {
  // WhatsApp
  source_id?: string;
  source_url?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  // Messenger e Instagram
  ad_id?: string;
  source?: string;
  ads_context_data?: { ad_title?: string; photo_url?: string; video_url?: string; post_id?: string };
};

export type MetadataWebhook = { referral?: Referral | null; ad?: { adId?: string | null; name?: string | null } | null } | null;

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v.slice(0, 2000) : null);

/** Datos del anuncio del webhook, ya ordenados (null si el mensaje no vino de un anuncio). */
export function anuncioDe(meta: MetadataWebhook): Anuncio | null {
  const r = meta?.referral;
  if (!r || typeof r !== "object") return null;
  const ctx = r.ads_context_data ?? {};
  // En Messenger, "video_url" de un anuncio con foto suele ser en realidad la imagen
  // (facebook.com/ads/image/… o un .jpg de fbcdn).
  const pareceFoto = (u?: string) => Boolean(u && (u.includes("/ads/image/") || /\.(jpe?g|png|webp)(\?|$)/i.test(u)));
  const fotoMessenger = ctx.photo_url ?? (pareceFoto(ctx.video_url) ? ctx.video_url : undefined);
  const esVideo = r.media_type === "video" || Boolean(ctx.video_url && !fotoMessenger);
  const a: Anuncio = {
    id: texto(r.source_id ?? r.ad_id ?? meta?.ad?.adId, 60),
    titulo: texto(r.headline ?? ctx.ad_title ?? meta?.ad?.name, 200),
    texto: texto(r.body, 1500),
    imagen: null,
    imagen_original: url(r.thumbnail_url ?? r.image_url ?? fotoMessenger),
    enlace: url(r.source_url) ?? (ctx.post_id ? `https://www.facebook.com/${encodeURIComponent(ctx.post_id)}` : null),
    video: url(r.video_url ?? (esVideo ? ctx.video_url : undefined)),
    tipo: esVideo ? "video" : r.media_type === "image" || fotoMessenger ? "image" : null,
  };
  return a.titulo || a.texto || a.imagen_original || a.enlace ? a : null;
}

/** Copia la miniatura del anuncio al almacenamiento (una vez por anuncio). Devuelve la ruta o null. */
async function guardarMiniatura(a: Anuncio): Promise<string | null> {
  if (!a.imagen_original) return null;
  const nombre = (a.id ?? a.imagen_original).replace(/[^\w-]/g, "").slice(-60) || "sin-id";
  const ruta = `anuncios/${nombre}.jpg`;
  const sb = createAdminClient().storage.from("attachments");
  const { data: ya } = await sb.list("anuncios", { search: `${nombre}.jpg`, limit: 1 });
  if (ya?.some((f) => f.name === `${nombre}.jpg`)) return ruta;
  try {
    const r = await fetch(a.imagen_original, { signal: AbortSignal.timeout(8000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.startsWith("image/")) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024) return null;
    const { error } = await sb.upload(ruta, bytes, { contentType: tipo.split(";")[0], upsert: true });
    return error ? null : ruta;
  } catch {
    return null;
  }
}

/** Guarda el anuncio de origen en el mensaje. No hace nada si el mensaje no vino de un anuncio. */
export async function guardarAnuncio(messageId: string, meta: MetadataWebhook): Promise<Anuncio | null> {
  const a = anuncioDe(meta);
  if (!a) return null;
  a.imagen = await guardarMiniatura(a);
  const { error } = await createAdminClient().from("messages").update({ ad_referral: a }).eq("id", messageId);
  if (error) throw error;
  return a;
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
