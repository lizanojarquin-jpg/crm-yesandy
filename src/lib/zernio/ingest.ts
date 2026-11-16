import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  downloadAttachment,
  listAccounts,
  listConversations,
  listMessages,
  type ZernioAttachment,
} from "./client";

type Platform = Database["public"]["Enums"]["channel_platform"];
type AttachmentType = Database["public"]["Enums"]["attachment_type"];
type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

const PLATAFORMAS: Platform[] = ["whatsapp", "facebook", "instagram", "tiktok"];
const asPlatform = (p: unknown): Platform | null =>
  PLATAFORMAS.includes(p as Platform) ? (p as Platform) : null;

const db = () => createAdminClient();

// ---------------------------------------------------------------------
// Canales
// ---------------------------------------------------------------------
export async function syncChannelAccounts() {
  const accounts = await listAccounts();
  const rows = accounts
    .filter((a) => asPlatform(a.platform))
    .map((a) => ({
      zernio_account_id: a._id,
      platform: asPlatform(a.platform)!,
      display_name: a.displayName || a.username || a.platform,
      status: (a.isActive === false || a.needsReconnection ? "disconnected" : "connected") as
        | "connected"
        | "disconnected",
    }));
  if (rows.length) {
    const { error } = await db().from("channel_accounts").upsert(rows, { onConflict: "zernio_account_id" });
    if (error) throw error;
  }
  return rows.length;
}

async function channelAccountId(zernioAccountId: string): Promise<string | null> {
  const find = () =>
    db().from("channel_accounts").select("id").eq("zernio_account_id", zernioAccountId).maybeSingle();
  let { data } = await find();
  if (!data) {
    await syncChannelAccounts();
    ({ data } = await find());
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------
// Contactos y conversaciones
// ---------------------------------------------------------------------
async function ensureContact(p: {
  platform: Platform;
  externalUserId: string;
  name?: string | null;
  handle?: string | null;
  phone?: string | null;
}): Promise<string> {
  const sb = db();
  const { data: ident } = await sb
    .from("contact_identities")
    .select("contact_id")
    .eq("platform", p.platform)
    .eq("external_user_id", p.externalUserId)
    .maybeSingle();
  if (ident) {
    // Completa datos que antes no teníamos.
    if (p.name || p.phone) {
      const { data: c } = await sb.from("contacts").select("name, phone").eq("id", ident.contact_id).single();
      const patch: { name?: string; phone?: string } = {};
      if (!c?.name && p.name) patch.name = p.name;
      if (!c?.phone && p.phone) patch.phone = p.phone;
      if (Object.keys(patch).length) await sb.from("contacts").update(patch).eq("id", ident.contact_id);
    }
    return ident.contact_id;
  }

  const { data: contact, error } = await sb
    .from("contacts")
    .insert({ name: p.name ?? null, phone: p.phone ?? null })
    .select("id")
    .single();
  if (error) throw error;

  const { error: e2 } = await sb.from("contact_identities").insert({
    contact_id: contact.id,
    platform: p.platform,
    external_user_id: p.externalUserId,
    handle: p.handle ?? null,
  });
  if (e2) {
    // Otro evento la creó al mismo tiempo: usamos esa y borramos el duplicado.
    await sb.from("contacts").delete().eq("id", contact.id);
    const { data: again } = await sb
      .from("contact_identities")
      .select("contact_id")
      .eq("platform", p.platform)
      .eq("external_user_id", p.externalUserId)
      .single();
    if (!again) throw e2;
    return again.contact_id;
  }
  return contact.id;
}

async function findConversation(channelAccountId: string, externalConversationId: string) {
  const { data } = await db()
    .from("conversations")
    .select("id, contact_id")
    .eq("channel_account_id", channelAccountId)
    .eq("external_conversation_id", externalConversationId)
    .maybeSingle();
  return data;
}

async function ensureConversation(p: {
  channelAccountId: string;
  contactId: string;
  externalConversationId: string;
  kind: "dm" | "comment";
  externalPostId?: string | null;
  postPermalink?: string | null;
}): Promise<string> {
  const existing = await findConversation(p.channelAccountId, p.externalConversationId);
  if (existing) return existing.id;
  const { data, error } = await db()
    .from("conversations")
    .upsert(
      {
        channel_account_id: p.channelAccountId,
        contact_id: p.contactId,
        external_conversation_id: p.externalConversationId,
        kind: p.kind,
        external_post_id: p.externalPostId ?? null,
        post_permalink: p.postPermalink ?? null,
      },
      { onConflict: "channel_account_id,external_conversation_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------------
// Mensajes y adjuntos
// ---------------------------------------------------------------------
async function insertMessage(p: {
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  externalId: string;
  replyTo?: string | null;
  createdAt?: string | null;
  deliveryStatus?: DeliveryStatus;
}): Promise<string | null> {
  const { data, error } = await db()
    .from("messages")
    .upsert(
      {
        conversation_id: p.conversationId,
        direction: p.direction,
        // Salientes que no salieron del CRM (p. ej. respondidos desde la app del celular).
        sender_type: p.direction === "inbound" ? "customer" : "agent",
        body: p.body,
        external_message_id: p.externalId,
        reply_to_external_id: p.replyTo ?? null,
        delivery_status: p.deliveryStatus ?? (p.direction === "inbound" ? "delivered" : "sent"),
        ...(p.createdAt ? { created_at: p.createdAt } : {}),
      },
      { onConflict: "external_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return data?.[0]?.id ?? null; // null = ya existía
}

const TIPOS: AttachmentType[] = ["image", "video", "audio", "file", "sticker"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

async function saveAttachments(conversationId: string, messageId: string, attachments: ZernioAttachment[]) {
  const sb = db();
  for (const [i, att] of attachments.entries()) {
    const type: AttachmentType = TIPOS.includes(att.type as AttachmentType) ? (att.type as AttachmentType) : "other";
    let storagePath: string | null = null;
    let mime = att.mimeType ?? null;
    if (att.url) {
      try {
        // Se descarga al recibirlo: Meta borra los archivos de WhatsApp después de un tiempo.
        const { bytes, contentType } = await downloadAttachment(att.url);
        mime = mime ?? contentType?.split(";")[0] ?? null;
        const ext = (mime && EXT[mime]) || "bin";
        storagePath = `${conversationId}/${messageId}/${i}.${ext}`;
        const { error } = await sb.storage
          .from("attachments")
          .upload(storagePath, bytes, { contentType: mime ?? "application/octet-stream", upsert: true });
        if (error) storagePath = null;
      } catch {
        storagePath = null; // queda la URL original para reintentar
      }
    }
    await sb.from("attachments").insert({
      message_id: messageId,
      type,
      mime_type: mime,
      storage_path: storagePath,
      external_url: att.url ?? null,
    });
  }
}

// ---------------------------------------------------------------------
// Eventos del webhook
// ---------------------------------------------------------------------
type MessageEvent = {
  event: string;
  message: {
    id: string;
    conversationId: string;
    platform: string;
    platformMessageId?: string | null;
    direction: "incoming" | "outgoing";
    text?: string | null;
    attachments?: ZernioAttachment[];
    sender?: { id: string; name?: string | null; username?: string | null; phoneNumber?: string | null };
    sentAt?: string | null;
  };
  conversation?: { id?: string; participantId?: string | null; participantName?: string | null; participantUsername?: string | null } | null;
  account?: { accountId?: string; id?: string } | null;
};

type CommentEvent = {
  event: "comment.received";
  comment: {
    id: string;
    postId?: string | null;
    platformPostId?: string | null;
    platform: string;
    text?: string | null;
    author: { id: string; username?: string | null; name?: string | null; isOwnAccount?: boolean };
    createdAt?: string | null;
    parentCommentId?: string | null;
  };
  post?: { id?: string | null; platformPostId?: string | null; permalink?: string | null } | null;
  account?: { accountId?: string; id?: string } | null;
};

export type ProcessResult = { status: "ok" | "duplicate" | "ignored"; detail?: string };

export async function processZernioEvent(payload: { event?: string } & Record<string, unknown>): Promise<ProcessResult> {
  switch (payload.event) {
    case "message.received":
    case "message.sent":
      return handleMessage(payload as unknown as MessageEvent);
    case "message.delivered":
    case "message.read":
    case "message.failed":
      return handleDelivery(payload as unknown as MessageEvent);
    case "comment.received":
      return handleComment(payload as unknown as CommentEvent);
    default:
      return { status: "ignored", detail: `evento ${payload.event} sin manejar` };
  }
}

async function handleMessage(e: MessageEvent): Promise<ProcessResult> {
  const m = e.message;
  const platform = asPlatform(m?.platform);
  if (!platform) return { status: "ignored", detail: `plataforma ${m?.platform}` };
  const zernioAccountId = e.account?.accountId ?? e.account?.id;
  if (!zernioAccountId) throw new Error("Evento sin accountId");
  const chId = await channelAccountId(zernioAccountId);
  if (!chId) throw new Error(`Cuenta ${zernioAccountId} no está en Zernio`);

  const externalConvId = e.conversation?.id ?? m.conversationId;
  const inbound = m.direction === "incoming";

  let conversationId: string;
  const existing = await findConversation(chId, externalConvId);
  if (existing) {
    conversationId = existing.id;
  } else {
    // Para mensajes salientes la otra persona no es el remitente.
    const otherId = inbound ? m.sender?.id : e.conversation?.participantId;
    if (!otherId) return { status: "ignored", detail: "saliente de una conversación desconocida" };
    const contactId = await ensureContact({
      platform,
      externalUserId: otherId,
      name: inbound ? m.sender?.name : e.conversation?.participantName,
      handle: inbound ? m.sender?.username : e.conversation?.participantUsername,
      phone: inbound ? m.sender?.phoneNumber : null,
    });
    conversationId = await ensureConversation({ channelAccountId: chId, contactId, externalConversationId: externalConvId, kind: "dm" });
  }

  const messageId = await insertMessage({
    conversationId,
    direction: inbound ? "inbound" : "outbound",
    body: m.text ?? null,
    externalId: m.platformMessageId ?? m.id,
    createdAt: m.sentAt,
  });
  if (!messageId) return { status: "duplicate" };
  if (m.attachments?.length) await saveAttachments(conversationId, messageId, m.attachments);
  return { status: "ok" };
}

async function handleDelivery(e: MessageEvent): Promise<ProcessResult> {
  const ids = [e.message?.platformMessageId, e.message?.id].filter(Boolean) as string[];
  if (!ids.length) return { status: "ignored", detail: "sin id de mensaje" };
  const status: DeliveryStatus =
    e.event === "message.read" ? "read" : e.event === "message.failed" ? "failed" : "delivered";
  const { data } = await db()
    .from("messages")
    .update({ delivery_status: status })
    .in("external_message_id", ids)
    .neq("delivery_status", "read") // no retroceder de "leído" a "entregado"
    .select("id");
  return data?.length ? { status: "ok" } : { status: "ignored", detail: "mensaje no encontrado" };
}

async function handleComment(e: CommentEvent): Promise<ProcessResult> {
  const c = e.comment;
  const platform = asPlatform(c?.platform);
  if (!platform) return { status: "ignored", detail: `plataforma ${c?.platform}` };
  const zernioAccountId = e.account?.accountId ?? e.account?.id;
  if (!zernioAccountId) throw new Error("Evento sin accountId");
  const chId = await channelAccountId(zernioAccountId);
  if (!chId) throw new Error(`Cuenta ${zernioAccountId} no está en Zernio`);

  const postId = e.post?.id ?? c.postId ?? e.post?.platformPostId ?? c.platformPostId ?? "sin-post";

  let conversationId: string;
  if (c.author?.isOwnAccount) {
    // Respuesta nuestra: va al hilo del comentario al que responde.
    if (!c.parentCommentId) return { status: "ignored", detail: "comentario propio sin padre" };
    const { data: parent } = await db()
      .from("messages")
      .select("conversation_id")
      .eq("external_message_id", c.parentCommentId)
      .maybeSingle();
    if (!parent) return { status: "ignored", detail: "respuesta propia a un comentario desconocido" };
    conversationId = parent.conversation_id;
  } else {
    const contactId = await ensureContact({
      platform,
      externalUserId: c.author.id,
      name: c.author.name ?? c.author.username,
      handle: c.author.username,
    });
    // Un hilo por persona y publicación.
    conversationId = await ensureConversation({
      channelAccountId: chId,
      contactId,
      externalConversationId: `comment:${postId}:${c.author.id}`,
      kind: "comment",
      externalPostId: postId,
      postPermalink: e.post?.permalink ?? null,
    });
  }

  const messageId = await insertMessage({
    conversationId,
    direction: c.author?.isOwnAccount ? "outbound" : "inbound",
    body: c.text ?? null,
    externalId: c.id,
    replyTo: c.parentCommentId,
    createdAt: c.createdAt,
  });
  return messageId ? { status: "ok" } : { status: "duplicate" };
}

// ---------------------------------------------------------------------
// Importar historial (mensajes directos que ya están en Zernio)
// ---------------------------------------------------------------------
export async function importInboxHistory(): Promise<{ conversaciones: number; mensajes: number }> {
  await syncChannelAccounts();
  const { data: cuentas } = await db().from("channel_accounts").select("id, zernio_account_id, platform").eq("status", "connected");
  let conversaciones = 0;
  let mensajes = 0;

  for (const cuenta of cuentas ?? []) {
    let cursor: string | undefined;
    do {
      const page = await listConversations(cuenta.zernio_account_id, cursor);
      for (const conv of page.data) {
        if (!conv.participantId) continue;
        const contactId = await ensureContact({
          platform: cuenta.platform,
          externalUserId: conv.participantId,
          name: conv.participantName && conv.participantName !== conv.participantId ? conv.participantName : null,
          handle: conv.participantUsername,
          phone: cuenta.platform === "whatsapp" ? conv.participantUsername ?? null : null,
        });
        const conversationId = await ensureConversation({
          channelAccountId: cuenta.id,
          contactId,
          externalConversationId: conv.id,
          kind: "dm",
        });
        conversaciones++;

        let mCursor: string | undefined;
        do {
          const mp = await listMessages(conv.id, cuenta.zernio_account_id, mCursor);
          for (const m of mp.messages) {
            const id = await insertMessage({
              conversationId,
              direction: m.direction === "incoming" ? "inbound" : "outbound",
              body: m.message ?? null,
              externalId: m.id,
              createdAt: m.sentAt ?? m.createdAt,
              deliveryStatus: (["sent", "delivered", "read", "failed"].includes(m.deliveryStatus ?? "")
                ? m.deliveryStatus
                : undefined) as DeliveryStatus | undefined,
            });
            if (id) {
              mensajes++;
              if (m.attachments?.length) await saveAttachments(conversationId, id, m.attachments);
            }
          }
          mCursor = mp.pagination?.hasMore ? mp.pagination.nextCursor ?? undefined : undefined;
        } while (mCursor);

        // El historial importado no cuenta como "no leído" salvo lo que Zernio marca.
        await db().from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
      }
      cursor = page.pagination?.hasMore ? page.pagination.nextCursor ?? undefined : undefined;
    } while (cursor);
  }
  return { conversaciones, mensajes };
}
