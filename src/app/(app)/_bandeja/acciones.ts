"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  markConversationRead,
  privateReplyToComment,
  replyToComment,
  sendInboxMessage,
  sendTemplate,
  ZernioError,
} from "@/lib/zernio/client";
import { contarVariables, cuerpo, plantillasDe, rellenar } from "@/lib/inbox/plantillas";
import { clasificarMensaje } from "@/lib/ia/clasificador";
import { ventanaMensajes } from "@/lib/inbox/ventana";
import { ETAPAS, type Etapa } from "@/lib/inbox/etiquetas";

export type Estado = { ok: boolean; mensaje: string; n?: number } | null;

const MAX_IMAGEN = 4 * 1024 * 1024;

/** Conversación con los datos que hacen falta para enviar. La lectura pasa por RLS. */
async function cargar(conversationId: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("conversations")
    .select(
      "id, kind, external_conversation_id, external_post_id, last_inbound_at, " +
        "canal:channel_accounts(platform, zernio_account_id)",
    )
    .eq("id", conversationId)
    .maybeSingle()
    .returns<{
      id: string;
      kind: "dm" | "comment";
      external_conversation_id: string;
      external_post_id: string | null;
      last_inbound_at: string | null;
      canal: { platform: "whatsapp" | "facebook" | "instagram" | "tiktok"; zernio_account_id: string };
    } | null>();
  return data;
}

function explicar(e: unknown): string {
  if (e instanceof ZernioError) {
    const t = JSON.stringify(e.body ?? "");
    if (t.includes("TEMPLATE_REQUIRED")) return "WhatsApp pide una plantilla aprobada: pasaron más de 24 horas desde el último mensaje del cliente.";
    if (t.includes("132001")) return "Meta no encontró esa plantilla (revisa el nombre y el idioma).";
    if (t.includes("131047")) return "Pasaron más de 24 horas: solo se puede enviar una plantilla aprobada.";
    if (t.includes("privateReplyConsumed")) return "Ese comentario ya recibió su mensaje privado (Meta permite uno por comentario).";
    if (t.includes("attachment_fetch_failed")) return "La plataforma no pudo descargar la imagen. Intenta de nuevo.";
    if (e.status === 429) return "Demasiados mensajes seguidos. Espera un momento y vuelve a intentar.";
    if (t.includes("message_allowance_exceeded")) return "Se agotaron los mensajes del plan de Zernio de este mes.";
    return `No se pudo enviar. ${e.message}`;
  }
  return e instanceof Error ? `No se pudo enviar. ${e.message}` : "No se pudo enviar.";
}

/** Envía un mensaje directo o responde un comentario desde el CRM. */
export async function enviar(conversationId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await getUsuarioActual();
  const conv = await cargar(conversationId);
  if (!conv) return { ok: false, mensaje: "La conversación no existe." };

  const texto = String(fd.get("mensaje") ?? "").trim();
  const archivo = fd.get("imagen");
  const imagen = archivo instanceof File && archivo.size > 0 ? archivo : null;
  const privado = fd.get("privado") === "1";
  const idem = String(fd.get("idem") ?? "") || undefined;

  if (!texto && !imagen) return { ok: false, mensaje: "Escribe un mensaje o adjunta una imagen." };
  if (texto.length > 4000) return { ok: false, mensaje: "El mensaje es demasiado largo." };
  if (imagen && (!imagen.type.startsWith("image/") || imagen.size > MAX_IMAGEN)) {
    return { ok: false, mensaje: "Solo se pueden enviar imágenes de hasta 4 MB." };
  }

  const admin = createAdminClient();
  const accountId = conv.canal.zernio_account_id;
  const platform = conv.canal.platform;

  try {
    if (conv.kind === "comment") {
      if (imagen) return { ok: false, mensaje: "A los comentarios solo se responde con texto." };
      // Se responde al último comentario del cliente en este hilo.
      const { data: ultimo } = await admin
        .from("messages")
        .select("external_message_id")
        .eq("conversation_id", conv.id)
        .eq("direction", "inbound")
        .not("external_message_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ultimo?.external_message_id || !conv.external_post_id) {
        return { ok: false, mensaje: "No encontré el comentario al que responder." };
      }

      if (privado) {
        if (platform !== "facebook" && platform !== "instagram") {
          return { ok: false, mensaje: "El mensaje privado solo existe en Facebook e Instagram." };
        }
        await privateReplyToComment(conv.external_post_id, ultimo.external_message_id, { accountId, message: texto });
        // Queda anotado en el hilo del comentario. La copia en el chat privado llega por el webhook.
        await admin.from("messages").insert({
          conversation_id: conv.id,
          direction: "outbound",
          sender_type: "agent",
          sender_profile_id: usuario.id,
          body: `🔒 Mensaje privado: ${texto}`,
          reply_to_external_id: ultimo.external_message_id,
          delivery_status: "sent",
        });
      } else {
        const r = await replyToComment(conv.external_post_id, {
          accountId,
          commentId: ultimo.external_message_id,
          message: texto,
          idempotencyKey: idem,
        });
        await guardarSaliente(admin, conv.id, usuario.id, texto, r.commentId, ultimo.external_message_id);
      }
    } else {
      const v = ventanaMensajes(platform, conv.last_inbound_at);
      if (!v.puede) return { ok: false, mensaje: v.aviso ?? "No se puede escribir en esta conversación." };

      let rutaImagen: string | null = null;
      let urlImagen: string | undefined;
      if (imagen) {
        rutaImagen = `${conv.id}/enviados/${crypto.randomUUID()}.${imagen.type === "image/png" ? "png" : "jpg"}`;
        const { error } = await admin.storage
          .from("attachments")
          .upload(rutaImagen, await imagen.arrayBuffer(), { contentType: imagen.type });
        if (error) return { ok: false, mensaje: "No se pudo subir la imagen." };
        // Enlace temporal para que la plataforma descargue la imagen.
        const { data: firmada } = await admin.storage.from("attachments").createSignedUrl(rutaImagen, 60 * 60);
        urlImagen = firmada?.signedUrl;
        if (!urlImagen) return { ok: false, mensaje: "No se pudo preparar la imagen." };
      }

      const base = {
        accountId,
        humanAgentTag: v.etiquetaAgente,
      };
      if (platform === "whatsapp" || !imagen || !texto) {
        // WhatsApp acepta imagen con texto en un solo mensaje.
        const r = await sendInboxMessage(conv.external_conversation_id, {
          ...base,
          message: texto || undefined,
          attachmentUrl: urlImagen,
          idempotencyKey: idem,
        });
        const id = await guardarSaliente(admin, conv.id, usuario.id, texto || null, r.messageId);
        if (rutaImagen && id) await guardarAdjunto(admin, id, rutaImagen, imagen!.type);
      } else {
        // Facebook, Instagram y TikTok: la imagen y el texto salen como dos mensajes.
        const ri = await sendInboxMessage(conv.external_conversation_id, {
          ...base,
          attachmentUrl: urlImagen,
          idempotencyKey: idem ? `${idem}-img` : undefined,
        });
        const idImg = await guardarSaliente(admin, conv.id, usuario.id, null, ri.messageId);
        if (rutaImagen && idImg) await guardarAdjunto(admin, idImg, rutaImagen, imagen.type);
        const rt = await sendInboxMessage(conv.external_conversation_id, {
          ...base,
          message: texto,
          idempotencyKey: idem ? `${idem}-txt` : undefined,
        });
        await guardarSaliente(admin, conv.id, usuario.id, texto, rt.messageId);
      }
    }
  } catch (e) {
    return { ok: false, mensaje: explicar(e) };
  }

  refresh();
  return { ok: true, mensaje: "Enviado", n: Date.now() };
}

/** Envía una plantilla aprobada de WhatsApp (para escribir fuera de las 24 h). */
export async function enviarPlantilla(conversationId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await getUsuarioActual();
  const conv = await cargar(conversationId);
  if (!conv || conv.kind !== "dm" || conv.canal.platform !== "whatsapp") {
    return { ok: false, mensaje: "Las plantillas solo se usan en WhatsApp." };
  }
  const nombre = String(fd.get("plantilla") ?? "");
  const idioma = String(fd.get("idioma") ?? "");
  const valores = fd.getAll("variable").map((v) => String(v).trim().slice(0, 500));
  const idem = String(fd.get("idem") ?? "") || undefined;

  // Se vuelve a comprobar en el servidor: que exista, esté aprobada y lleve todos los datos.
  const p = (await plantillasDe(conv.canal.zernio_account_id)).find(
    (x) => x.name === nombre && x.language === idioma && x.status === "APPROVED",
  );
  if (!p) return { ok: false, mensaje: "Esa plantilla no está aprobada." };
  const texto = cuerpo(p);
  const n = contarVariables(texto);
  if (valores.length < n || valores.slice(0, n).some((v) => !v)) {
    return { ok: false, mensaje: "Completa todos los datos de la plantilla." };
  }

  try {
    const r = await sendTemplate(conv.external_conversation_id, {
      accountId: conv.canal.zernio_account_id,
      name: p.name,
      language: p.language,
      params: valores.slice(0, n),
      idempotencyKey: idem,
    });
    const admin = createAdminClient();
    const body = `📋 ${rellenar(texto, valores)}`;
    if (r.messageId) {
      await guardarSaliente(admin, conv.id, usuario.id, body, r.messageId);
    } else {
      await admin.from("messages").insert({
        conversation_id: conv.id,
        direction: "outbound",
        sender_type: "agent",
        sender_profile_id: usuario.id,
        body,
        delivery_status: "sent",
      });
    }
  } catch (e) {
    return { ok: false, mensaje: explicar(e) };
  }
  refresh();
  return { ok: true, mensaje: "Plantilla enviada", n: Date.now() };
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Guarda lo enviado con la persona que lo envió. Si el webhook ya trajo el mismo mensaje
 * (mismo id externo), solo se completa quién lo envió.
 */
async function guardarSaliente(
  admin: Admin,
  conversationId: string,
  perfilId: string,
  body: string | null,
  externalId: string,
  replyTo?: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("messages")
    .upsert(
      {
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "agent",
        sender_profile_id: perfilId,
        body,
        external_message_id: externalId,
        reply_to_external_id: replyTo ?? null,
        delivery_status: "sent",
      },
      { onConflict: "external_message_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  // "Voy a preparar tu pedido", guías, etc.: se revisa después de responder, sin hacer esperar.
  if (data?.id) after(() => clasificarMensaje(data.id).catch((e) => console.error("clasificador", e)));
  return data?.id ?? null;
}

async function guardarAdjunto(admin: Admin, messageId: string, ruta: string, mime: string) {
  const { count } = await admin.from("attachments").select("id", { count: "exact", head: true }).eq("message_id", messageId);
  if (count) return; // el webhook ya lo guardó
  await admin.from("attachments").insert({ message_id: messageId, type: "image", mime_type: mime, storage_path: ruta });
}

// ---------------------------------------------------------------------
// Acciones sobre la conversación (con la sesión del usuario: aplican las reglas RLS)
// ---------------------------------------------------------------------
export async function marcarLeida(conversationId: string) {
  await getUsuarioActual();
  const sb = await createClient();
  const { data } = await sb
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .gt("unread_count", 0)
    .select("kind, external_conversation_id, canal:channel_accounts(zernio_account_id)")
    .returns<{ kind: string; external_conversation_id: string; canal: { zernio_account_id: string } }[]>();
  const c = data?.[0];
  if (c?.kind === "dm") {
    // Igual que abrir el chat en la app: el cliente ve su mensaje como leído.
    after(() => markConversationRead(c.external_conversation_id, c.canal.zernio_account_id).catch(() => null));
  }
}

export async function asignar(conversationId: string, perfilId: string | null) {
  await getUsuarioActual();
  const sb = await createClient();
  await sb.from("conversations").update({ assigned_to: perfilId }).eq("id", conversationId);
  refresh();
}

export async function tomar(conversationId: string) {
  const usuario = await getUsuarioActual();
  await asignar(conversationId, usuario.id);
}

export async function cambiarEstado(conversationId: string, estado: "open" | "closed") {
  await getUsuarioActual();
  const sb = await createClient();
  await sb.from("conversations").update({ status: estado }).eq("id", conversationId);
  refresh();
}

// ---------------------------------------------------------------------
// Ficha del contacto
// ---------------------------------------------------------------------
export async function guardarContacto(contactId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  await getUsuarioActual();
  const txt = (k: string, max: number) => {
    const v = String(fd.get(k) ?? "").trim().slice(0, max);
    return v || null;
  };
  const fecha = String(fd.get("seguimiento") ?? "");
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, mensaje: "Fecha no válida." };

  const sb = await createClient();
  const { error } = await sb
    .from("contacts")
    .update({
      name: txt("nombre", 120),
      phone: txt("telefono", 40),
      notes: txt("notas", 4000),
      loss_reason: txt("motivo", 300),
      // A las 8 a. m. de Costa Rica del día elegido.
      follow_up_at: fecha ? `${fecha}T08:00:00-06:00` : null,
    })
    .eq("id", contactId);
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  refresh();
  return { ok: true, mensaje: "Guardado", n: Date.now() };
}

export async function cambiarEtapa(contactId: string, etapa: Etapa) {
  await getUsuarioActual();
  if (!ETAPAS.some((e) => e.valor === etapa)) return;
  const sb = await createClient();
  // El trigger actualiza la etapa del contacto y guarda de dónde venía.
  await sb.from("stage_events").insert({ contact_id: contactId, to_stage: etapa, source: "manual" });
  refresh();
}

/** Confirma la etapa que detectó la IA (la marca de "por revisar" se quita sola). */
export async function confirmarEtapa(contactId: string) {
  const usuario = await getUsuarioActual();
  const sb = await createClient();
  const { data: ev } = await sb
    .from("stage_events")
    .select("id")
    .eq("contact_id", contactId)
    .eq("source", "ai")
    .is("confirmed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ev) {
    await sb.from("stage_events").update({ confirmed_by: usuario.id, confirmed_at: new Date().toISOString() }).eq("id", ev.id);
  }
  refresh();
}
