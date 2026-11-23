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
      "id, kind, status, unread_count, last_message_at, last_message_preview, assigned_to, ai_mode, ai_attending, " +
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
  if (f.ver === "sin_leer") q = q.gt("unread_count", 0);
  if (f.ver === "mias") q = q.eq("assigned_to", usuarioId);
  if (f.ver === "comentarios") q = q.eq("kind", "comment");
  const { data, error } = await q.returns<ConversacionLista[]>();
  if (error) throw error;
  return data ?? [];
}

export type ConversacionLista = {
  id: string;
  kind: "dm" | "comment";
  status: "open" | "closed";
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
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
};

export async function listarMensajes(conversationId: string): Promise<Mensaje[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("messages")
    .select(
      "id, direction, sender_type, sender_profile_id, body, delivery_status, error_message, created_at, " +
        "attachments(id, type, mime_type, storage_path, external_url, detected_kind, transcript)",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<
      (Omit<Mensaje, "adjuntos" | "evidencia"> & {
        attachments: {
          id: string;
          type: string;
          mime_type: string | null;
          storage_path: string | null;
          external_url: string | null;
          detected_kind: string | null;
          transcript: string | null;
        }[];
      })[]
    >();
  if (error) throw error;

  const ids = (data ?? []).map((m) => m.id);
  const { data: eventos } = ids.length
    ? await sb.from("stage_events").select("evidence_message_id, to_stage, confirmed_at").eq("source", "ai").in("evidence_message_id", ids)
    : { data: [] };
  const evid = new Map((eventos ?? []).map((e) => [e.evidence_message_id!, { to_stage: e.to_stage, confirmada: Boolean(e.confirmed_at) }]));

  const rutas = (data ?? []).flatMap((m) => m.attachments.map((a) => a.storage_path)).filter(Boolean) as string[];
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data: urls } = await sb.storage.from("attachments").createSignedUrls(rutas, 60 * 60);
    for (const u of urls ?? []) if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl);
  }

  return (data ?? [])
    .reverse()
    .map(({ attachments, ...m }) => ({
      ...m,
      evidencia: evid.get(m.id) ?? null,
      adjuntos: attachments.map((a) => ({
        id: a.id,
        type: a.type,
        mime_type: a.mime_type,
        detected_kind: a.detected_kind,
        transcript: a.transcript,
        // Las fotos del catálogo que envía la IA se muestran desde la tienda (son públicas).
        url: a.storage_path
          ? firmadas.get(a.storage_path) ?? null
          : a.external_url?.startsWith("https://shop.yesandycr.com/")
            ? a.external_url
            : null,
      })),
    }));
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
