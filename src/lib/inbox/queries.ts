import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Filtros } from "./filtros";

// Todas las lecturas usan la sesión del usuario: aplican las reglas RLS.

export async function listarConversaciones(f: Filtros, usuarioId: string) {
  const sb = await createClient();
  let q = sb
    .from("conversations")
    .select(
      "id, kind, status, unread_count, last_message_at, last_message_preview, last_inbound_at, assigned_to, ai_mode, ai_attending, " +
        "contacto:contacts!inner(id, name, phone, stage, stage_pending_review, contact_identities(handle)), " +
        "canal:channel_accounts!inner(platform)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(150);
  if (f.buscar) {
    // Al buscar se miran abiertas y cerradas, por nombre o teléfono del cliente.
    q = q.or(`name.ilike.*${f.buscar}*,phone.ilike.*${f.buscar}*`, { referencedTable: "contacto" });
  } else {
    q = q.eq("status", f.cerradas ? "closed" : "open");
  }
  if (f.canal) q = q.eq("canal.platform", f.canal);
  if (f.etapa) q = q.eq("contacto.stage", f.etapa);
  if (f.sinLeer) q = q.gt("unread_count", 0);
  if (f.ver === "mias") q = q.eq("assigned_to", usuarioId);
  if (f.ver === "comentarios") q = q.eq("kind", "comment");
  if (f.vendedora === "libres") q = q.is("assigned_to", null);
  else if (f.vendedora) q = q.eq("assigned_to", f.vendedora);
  const { data, error } = await q.returns<ConversacionLista[]>();
  if (error) throw error;
  return data ?? [];
}

/** Cuántas conversaciones abiertas tienen mensajes sin leer (las mías, las de una vendedora o todas). */
export async function contarSinLeer(f: Filtros, usuarioId: string) {
  const sb = await createClient();
  // Sin "head": con la sesión del usuario esa variante devolvía 0.
  let q = sb.from("conversations").select("id", { count: "exact" }).eq("status", "open").gt("unread_count", 0).limit(1);
  if (f.ver === "mias") q = q.eq("assigned_to", usuarioId);
  if (f.ver === "comentarios") q = q.eq("kind", "comment");
  if (f.vendedora === "libres") q = q.is("assigned_to", null);
  else if (f.vendedora) q = q.eq("assigned_to", f.vendedora);
  const { count } = await q;
  return count ?? 0;
}

export type ConversacionLista = {
  id: string;
  kind: "dm" | "comment";
  status: "open" | "closed";
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  assigned_to: string | null;
  ai_mode: "on" | "off" | "handoff";
  /** La asesora IA está atendiendo: ventas no la puede tomar todavía. */
  ai_attending: boolean;
  contacto: {
    id: string;
    name: string | null;
    phone: string | null;
    stage: import("./etiquetas").Etapa;
    stage_pending_review: boolean;
    contact_identities: { handle: string | null }[];
  };
  canal: { platform: import("./etiquetas").Plataforma };
};

export const listarEquipo = cache(async () => {
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, display_name, public_name, role, active").order("display_name");
  // Adentro se ve "Ventas 1 · Hellen": el usuario y el nombre con que se presenta a los clientes.
  return (data ?? [])
    .filter((p) => p.active)
    .map((p) => ({ ...p, display_name: p.public_name ? `${p.display_name} · ${p.public_name}` : p.display_name }));
});

export async function obtenerConversacion(id: string) {
  const sb = await createClient();
  const { data, error } = await sb
    .from("conversations")
    .select(
      "id, kind, status, unread_count, assigned_to, ai_mode, ai_attending, external_conversation_id, external_post_id, post_permalink, last_inbound_at, contact_id, " +
        "contacto:contacts(id, name, phone, stage, stage_pending_review, notes, follow_up_at, loss_reason, contact_identities(platform, handle)), " +
        "canal:channel_accounts(platform, display_name, zernio_account_id)",
    )
    .eq("id", id)
    .maybeSingle()
    .returns<ConversacionDetalle | null>();
  if (error) throw error;
  return data;
}

export type ConversacionDetalle = {
  id: string;
  kind: "dm" | "comment";
  status: "open" | "closed";
  unread_count: number;
  assigned_to: string | null;
  external_conversation_id: string;
  external_post_id: string | null;
  post_permalink: string | null;
  last_inbound_at: string | null;
  ai_mode: "on" | "off" | "handoff";
  ai_attending: boolean;
  contact_id: string;
  contacto: {
    id: string;
    name: string | null;
    phone: string | null;
    stage: import("./etiquetas").Etapa;
    stage_pending_review: boolean;
    notes: string | null;
    follow_up_at: string | null;
    loss_reason: string | null;
    contact_identities: { platform: import("./etiquetas").Plataforma; handle: string | null }[];
  };
  canal: { platform: import("./etiquetas").Plataforma; display_name: string; zernio_account_id: string };
};

export type Mensaje = {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "ai" | "agent";
  sender_profile_id: string | null;
  body: string | null;
  delivery_status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message: string | null;
  created_at: string;
  adjuntos: {
    id: string;
    type: string;
    mime_type: string | null;
    url: string | null;
    detected_kind: string | null;
    transcript: string | null;
  }[];
  /** Etapa que la IA detectó con este mensaje como evidencia. */
  evidencia: { to_stage: import("./etiquetas").Etapa; confirmada: boolean } | null;
  /** Ubicación que mandó el cliente (WhatsApp). */
  ubicacion: { latitude: number; longitude: number; name?: string; address?: string } | null;
  /** Mensaje que el cliente (o el equipo) citó al responder. */
  cita: Cita | null;
  /** Anuncio del que vino el cliente (solo en el primer mensaje después de tocarlo). */
  anuncio: { titulo: string | null; texto: string | null; imagen: string | null; enlace: string | null; video: string | null } | null;
};

export type Cita = {
  /** Id del mensaje citado si está en el CRM (para ir a él); null si es más viejo que el CRM. */
  id: string | null;
  /** null si no se encontró el mensaje citado. */
  deCliente: boolean | null;
  texto: string | null;
  foto: string | null;
  /** Tipo del primer adjunto del mensaje citado (image, audio…). */
  tipo: string | null;
};

type AdjuntoFila = {
  id: string;
  type: string;
  mime_type: string | null;
  storage_path: string | null;
  external_url: string | null;
  detected_kind: string | null;
  transcript: string | null;
};
const CAMPOS_ADJUNTO = "attachments(id, type, mime_type, storage_path, external_url, detected_kind, transcript)";

export async function listarMensajes(conversationId: string, opciones: { citas?: boolean } = {}): Promise<Mensaje[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("messages")
    .select(
      "id, direction, sender_type, sender_profile_id, body, delivery_status, error_message, created_at, " +
        `external_message_id, reply_to_external_id, location, ad_referral, ${CAMPOS_ADJUNTO}`,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      (Omit<Mensaje, "adjuntos" | "evidencia" | "ubicacion" | "cita" | "anuncio"> & {
        external_message_id: string | null;
        reply_to_external_id: string | null;
        location: Mensaje["ubicacion"];
        ad_referral: (NonNullable<Mensaje["anuncio"]> & { imagen_original: string | null }) | null;
        attachments: AdjuntoFila[];
      })[]
    >();
  if (error) throw error;
  const filas = data ?? [];

  const ids = filas.map((m) => m.id);
  const { data: eventos } = ids.length
    ? await sb.from("stage_events").select("evidence_message_id, to_stage, confirmed_at").eq("source", "ai").in("evidence_message_id", ids)
    : { data: [] };
  const evid = new Map((eventos ?? []).map((e) => [e.evidence_message_id!, { to_stage: e.to_stage, confirmada: Boolean(e.confirmed_at) }]));

  // Mensajes citados: casi siempre están entre los cargados; si son más viejos, se buscan aparte.
  // (En hilos de comentarios no se muestran: ahí cada respuesta apunta al comentario y sería ruido.)
  type Citado = { id: string; direction: "inbound" | "outbound"; body: string | null; attachments: AdjuntoFila[] };
  const conCitas = opciones.citas !== false;
  const citados = new Map<string, Citado>();
  for (const m of filas) if (m.external_message_id) citados.set(m.external_message_id, m);
  const faltan = conCitas
    ? [...new Set(filas.map((m) => m.reply_to_external_id).filter((x): x is string => Boolean(x) && !citados.has(x!)))]
    : [];
  if (faltan.length) {
    const { data: viejos } = await sb
      .from("messages")
      .select(`id, direction, body, external_message_id, ${CAMPOS_ADJUNTO}`)
      .eq("conversation_id", conversationId)
      .in("external_message_id", faltan)
      .returns<(Citado & { external_message_id: string })[]>();
    for (const m of viejos ?? []) citados.set(m.external_message_id, m);
  }

  const todosLosAdjuntos = [...filas.flatMap((m) => m.attachments), ...[...citados.values()].flatMap((m) => m.attachments)];
  const rutas = [
    ...new Set(
      [...todosLosAdjuntos.map((a) => a.storage_path), ...filas.map((m) => m.ad_referral?.imagen)].filter(Boolean) as string[],
    ),
  ];
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data: urls } = await sb.storage.from("attachments").createSignedUrls(rutas, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl);
  }
  // Las fotos del catálogo que envía la IA se muestran desde la tienda (son públicas).
  const urlDe = (a: AdjuntoFila) =>
    a.storage_path
      ? firmadas.get(a.storage_path) ?? null
      : a.external_url?.startsWith("https://shop.yesandycr.com/")
        ? a.external_url
        : null;

  const citaDe = (externo: string | null): Cita | null => {
    if (!conCitas || !externo) return null;
    const q = citados.get(externo);
    if (!q) return { id: null, deCliente: null, texto: null, foto: null, tipo: null };
    const foto = q.attachments.find((a) => a.type === "image" || a.type === "sticker");
    const voz = q.attachments.find((a) => a.transcript)?.transcript ?? null;
    return {
      id: q.id,
      deCliente: q.direction === "inbound",
      texto: q.body?.trim() || (voz ? `🎤 ${voz}` : null),
      foto: foto ? urlDe(foto) : null,
      tipo: q.attachments[0]?.type ?? null,
    };
  };

  return filas.reverse().map((fila) => {
    // external_message_id solo sirve para encontrar las citas: no se manda a la pantalla.
    const { attachments, reply_to_external_id, location, external_message_id, ad_referral: ad, ...m } = fila;
    void external_message_id;
    return {
      ...m,
      evidencia: evid.get(m.id) ?? null,
      ubicacion: location ?? null,
      // Si la miniatura no se pudo copiar, se intenta con la original de Facebook (puede haber caducado).
      anuncio: ad
        ? {
            titulo: ad.titulo,
            texto: ad.texto,
            imagen: (ad.imagen && firmadas.get(ad.imagen)) || ad.imagen_original,
            enlace: ad.enlace,
            video: ad.video,
          }
        : null,
      cita: citaDe(reply_to_external_id),
      adjuntos: attachments.map((a) => ({
        id: a.id,
        type: a.type,
        mime_type: a.mime_type,
        detected_kind: a.detected_kind,
        transcript: a.transcript,
        url: urlDe(a),
      })),
    };
  });
}

/** Otras conversaciones del mismo contacto y el historial de etapas, para la ficha. */
export async function datosFicha(contactId: string, conversacionActual: string) {
  const sb = await createClient();
  const [convs, etapas] = await Promise.all([
    sb
      .from("conversations")
      .select("id, kind, last_message_at, canal:channel_accounts(platform)")
      .eq("contact_id", contactId)
      .neq("id", conversacionActual)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .returns<{ id: string; kind: "dm" | "comment"; last_message_at: string | null; canal: { platform: import("./etiquetas").Plataforma } }[]>(),
    sb
      .from("stage_events")
      .select("id, from_stage, to_stage, source, created_at, created_by, confirmed_at, note")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  return { otras: convs.data ?? [], etapas: etapas.data ?? [] };
}

export async function listarRespuestasRapidas() {
  const sb = await createClient();
  const { data } = await sb.from("quick_replies").select("id, title, body").order("sort_order").order("title");
  return data ?? [];
}

export type Traspaso = {
  id: string;
  reason: string;
  summary: Partial<Record<"para_quien" | "ocasion" | "fecha" | "estilo" | "talla" | "prendas" | "dudas", string>>;
  created_at: string;
};

/** Último traspaso de la IA que nadie ha tomado en esta conversación. */
export async function traspasoAbierto(conversationId: string): Promise<Traspaso | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("ai_handoffs")
    .select("id, reason, summary, created_at")
    .eq("conversation_id", conversationId)
    .is("taken_by", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Traspaso | null) ?? null;
}
