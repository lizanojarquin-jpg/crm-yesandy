"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getUsuarioActual, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  markConversationRead,
  privateReplyToComment,
  replyToComment,
  sendInboxMessage,
  sendTemplate,
  vistoYEscribiendo,
  ZernioError,
} from "@/lib/zernio/client";
import { contarVariables, cuerpo, plantillasDe, rellenar } from "@/lib/inbox/plantillas";
import { clasificarMensaje } from "@/lib/ia/clasificador";
import { transcribirAudiosDeMensaje } from "@/lib/ia/transcribir";
import { avisarLiberado } from "@/lib/push";
import { ventanaMensajes } from "@/lib/inbox/ventana";
import { ETAPAS, type Etapa } from "@/lib/inbox/etiquetas";

/** `enviadas`: fotos que alcanzaron a salir (en orden) cuando el envío se cortó a la mitad. */
export type Estado = { ok: boolean; mensaje: string; n?: number; enviadas?: number } | null;

/** Fotos por envío. El chat manda más en grupos de este tamaño (cada grupo tarda unos 12 s). */
const MAX_FOTOS = 10;
const MAX_IMAGEN = 5 * 1024 * 1024; // límite de WhatsApp
const MAX_AUDIO = 16 * 1024 * 1024; // límite de WhatsApp
/** Canales que reciben audios por mensaje directo (TikTok solo acepta texto o una foto). */
const CANALES_AUDIO = ["whatsapp", "facebook", "instagram"];
/** Tipo de archivo que se guarda, según la extensión (no se confía en lo que diga el navegador). */
const FORMATOS: Record<string, { tipo: "image" | "audio"; mime: string }> = {
  jpg: { tipo: "image", mime: "image/jpeg" },
  png: { tipo: "image", mime: "image/png" },
  m4a: { tipo: "audio", mime: "audio/mp4" },
  ogg: { tipo: "audio", mime: "audio/ogg" },
  mp3: { tipo: "audio", mime: "audio/mpeg" },
};
const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};
/**
 * Formato de audio que acepta cada canal: WhatsApp nota de voz OGG/Opus o, de respaldo en iPhones
 * que no pueden crearla, MP3 (rechaza el M4A del navegador); Instagram rechaza OGG y acepta M4A;
 * Messenger acepta M4A.
 */
const AUDIO_DEL_CANAL: Record<string, string[]> = { whatsapp: ["ogg", "mp3"], facebook: ["m4a"], instagram: ["m4a"] };

/** Conversación con los datos que hacen falta para enviar. La lectura pasa por RLS. */
async function cargar(conversationId: string) {
  const sb = await createClient();
  const { data } = await sb
    .from("conversations")
    .select(
      "id, kind, external_conversation_id, external_post_id, last_inbound_at, assigned_to, ai_attending, " +
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
      assigned_to: string | null;
      ai_attending: boolean;
      canal: { platform: "whatsapp" | "facebook" | "instagram" | "tiktok"; zernio_account_id: string };
    } | null>();
  return data;
}

/** Solo responde quien tomó la conversación, o un administrador. */
function sinPermisoParaResponder(
  usuario: { id: string; rol: string },
  conv: { assigned_to: string | null; ai_attending: boolean },
): Estado {
  if (usuario.rol === "admin" || conv.assigned_to === usuario.id) return null;
  return {
    ok: false,
    mensaje: conv.assigned_to
      ? "Esta conversación la atiende otra persona. Solo ella y administración pueden responder."
      : conv.ai_attending
        ? "La asesora IA está atendiendo a este cliente. Te avisamos cuando esté listo para tomarlo."
        : "Toma la conversación para poder responder.",
  };
}

/** Una persona entra a un chat que tenía la IA: la IA se retira y deja de bloquearlo. */
async function retirarIA(conversationId: string) {
  await createAdminClient()
    .from("conversations")
    .update({ ai_mode: "off", ai_attending: false, ai_attending_since: null })
    .eq("id", conversationId)
    .eq("ai_attending", true);
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

export type Subida = { ok: true; subidas: { ruta: string; token: string }[] } | { ok: false; mensaje: string };

/**
 * Prepara la subida de fotos o de un audio: el navegador los sube directo al almacenamiento
 * (sin pasar por el servidor, que tiene límite de tamaño) y después llama a `enviar` con las rutas.
 */
export async function prepararSubida(
  conversationId: string,
  archivos: { tipo: "image" | "audio"; mime: string; tamano: number }[],
): Promise<Subida> {
  const usuario = await getUsuarioActual();
  const conv = await cargar(conversationId);
  if (!conv) return { ok: false, mensaje: "La conversación no existe." };
  const bloqueo = sinPermisoParaResponder(usuario, conv);
  if (bloqueo) return { ok: false, mensaje: bloqueo.mensaje };
  if (conv.kind !== "dm") return { ok: false, mensaje: "A los comentarios solo se responde con texto." };
  const v = ventanaMensajes(conv.canal.platform, conv.last_inbound_at);
  if (!v.puede) return { ok: false, mensaje: v.aviso ?? "No se puede escribir en esta conversación." };

  const audios = archivos.filter((a) => a.tipo === "audio");
  if (!archivos.length) return { ok: false, mensaje: "No hay archivos para enviar." };
  if (archivos.length - audios.length > MAX_FOTOS) return { ok: false, mensaje: `Se pueden enviar hasta ${MAX_FOTOS} fotos a la vez.` };
  if (audios.length && (audios.length > 1 || archivos.length > 1)) return { ok: false, mensaje: "El audio se envía solo." };
  if (audios.length && !CANALES_AUDIO.includes(conv.canal.platform)) {
    return { ok: false, mensaje: "Los audios solo se pueden enviar por WhatsApp, Messenger e Instagram." };
  }

  const admin = createAdminClient();
  const subidas: { ruta: string; token: string }[] = [];
  for (const a of archivos) {
    const ext = EXTENSION[a.mime.split(";")[0]];
    if (!ext || FORMATOS[ext].tipo !== a.tipo || (a.tipo === "audio" && !AUDIO_DEL_CANAL[conv.canal.platform]?.includes(ext))) {
      return {
        ok: false,
        mensaje:
          a.tipo === "audio"
            ? "Este navegador no puede preparar audios para este canal. Actualiza Chrome o Safari e intenta de nuevo."
            : "Solo se pueden enviar fotos JPG o PNG.",
      };
    }
    if (a.tamano <= 0 || a.tamano > (a.tipo === "audio" ? MAX_AUDIO : MAX_IMAGEN)) {
      return { ok: false, mensaje: a.tipo === "audio" ? "El audio pesa demasiado (máximo 16 MB)." : "Cada foto puede pesar hasta 5 MB." };
    }
    const ruta = `${conv.id}/enviados/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await admin.storage.from("attachments").createSignedUploadUrl(ruta);
    if (error || !data) return { ok: false, mensaje: "No se pudo preparar la subida. Intenta de nuevo." };
    subidas.push({ ruta, token: data.token });
  }
  return { ok: true, subidas };
}

/** Rutas subidas con `prepararSubida`: solo se aceptan las de esta conversación. */
function leerAdjuntos(conversationId: string, fd: FormData) {
  const patron = new RegExp(`^${conversationId}/enviados/[0-9a-f-]{36}\\.(jpg|png|m4a|ogg|mp3)$`);
  const rutas = fd.getAll("adjunto").map(String);
  if (rutas.some((r) => !patron.test(r))) return null;
  return rutas.map((ruta) => ({ ruta, ...FORMATOS[ruta.split(".").pop()!] }));
}

/** Envía un mensaje directo (texto, varias fotos o un audio) o responde un comentario desde el CRM. */
export async function enviar(conversationId: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await getUsuarioActual();
  const conv = await cargar(conversationId);
  if (!conv) return { ok: false, mensaje: "La conversación no existe." };
  const bloqueo = sinPermisoParaResponder(usuario, conv);
  if (bloqueo) return bloqueo;

  const texto = String(fd.get("mensaje") ?? "").trim();
  const adjuntos = leerAdjuntos(conv.id, fd);
  if (!adjuntos) return { ok: false, mensaje: "Hay un archivo que no corresponde a esta conversación." };
  const fotos = adjuntos.filter((a) => a.tipo === "image");
  const audio = adjuntos.find((a) => a.tipo === "audio");
  const privado = fd.get("privado") === "1";
  const idem = String(fd.get("idem") ?? "") || undefined;

  if (!texto && !adjuntos.length) return { ok: false, mensaje: "Escribe un mensaje o adjunta una foto." };
  if (texto.length > 4000) return { ok: false, mensaje: "El mensaje es demasiado largo." };
  if (fotos.length > MAX_FOTOS) return { ok: false, mensaje: `Se pueden enviar hasta ${MAX_FOTOS} fotos a la vez.` };
  if (audio && (adjuntos.length > 1 || texto)) return { ok: false, mensaje: "El audio se envía solo." };

  const admin = createAdminClient();
  const accountId = conv.canal.zernio_account_id;
  const platform = conv.canal.platform;
  let enviadas = 0;

  try {
    if (conv.kind === "comment") {
      if (adjuntos.length) return { ok: false, mensaje: "A los comentarios solo se responde con texto." };
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

      if (audio && !CANALES_AUDIO.includes(platform)) {
        return { ok: false, mensaje: "Los audios solo se pueden enviar por WhatsApp, Messenger e Instagram." };
      }
      if (audio && !AUDIO_DEL_CANAL[platform]?.includes(audio.ruta.split(".").pop()!)) {
        return { ok: false, mensaje: "Este navegador no puede preparar audios para este canal. Actualiza Chrome o Safari." };
      }
      // Como abrir el chat en la app: lo que escribió el cliente queda como visto antes de responder.
      await markConversationRead(conv.external_conversation_id, accountId).catch((e) => console.error("leído", e));

      // Enlaces temporales para que la plataforma descargue cada archivo (falla si no se subió).
      const urls = new Map<string, string>();
      if (adjuntos.length) {
        const { data: firmadas } = await admin.storage.from("attachments").createSignedUrls(
          adjuntos.map((a) => a.ruta),
          60 * 60,
        );
        for (const f of firmadas ?? []) if (f.signedUrl && !f.error && f.path) urls.set(f.path, f.signedUrl);
        if (adjuntos.some((a) => !urls.has(a.ruta))) return { ok: false, mensaje: "No se pudo subir el archivo. Intenta de nuevo." };
      }

      const base = { accountId, humanAgentTag: v.etiquetaAgente };
      // Con la misma llave, un reintento no repite lo que ya salió.
      const llave = (s: string) => (idem ? (adjuntos.length ? `${idem}-${s}` : idem) : undefined);
      const mandarTexto = async () => {
        const r = await sendInboxMessage(conv.external_conversation_id, { ...base, message: texto, idempotencyKey: llave("txt") });
        await guardarSaliente(admin, conv.id, usuario.id, texto, r.messageId);
      };
      const mandarArchivo = async (a: (typeof adjuntos)[number], i: number, conTexto: boolean) => {
        const r = await sendInboxMessage(conv.external_conversation_id, {
          ...base,
          message: conTexto ? texto : undefined,
          attachmentUrl: urls.get(a.ruta),
          attachmentType: a.tipo,
          voiceNote: a.tipo === "audio" && platform === "whatsapp" && a.ruta.endsWith(".ogg"),
          // Cada foto subida tiene su propia llave: aunque se reintente en otro grupo, nunca sale dos veces.
          idempotencyKey: a.tipo === "audio" ? llave(`a${i}`) : `foto-${a.ruta.split("/").pop()!.split(".")[0]}`,
        });
        const id = await guardarSaliente(admin, conv.id, usuario.id, conTexto ? texto : null, r.messageId, undefined, a.tipo !== "audio");
        if (id) {
          await guardarAdjunto(admin, id, a.ruta, a.mime, a.tipo);
          // El audio se transcribe para que se pueda leer y el seguimiento lo entienda ("ya va en camino").
          if (a.tipo === "audio") {
            after(async () => {
              await transcribirAudiosDeMensaje(id).catch((e) => console.error("transcribir saliente", e));
              await clasificarMensaje(id).catch((e) => console.error("clasificador", e));
            });
          }
        }
        enviadas++;
      };

      if (audio) {
        await mandarArchivo(audio, 0, false);
      } else if (platform === "whatsapp") {
        // WhatsApp: el texto va como pie de la primera foto.
        if (!fotos.length) await mandarTexto();
        for (const [i, f] of fotos.entries()) await mandarArchivo(f, i, i === 0 && !!texto);
      } else {
        // Facebook, Instagram y TikTok no juntan foto y texto: primero el texto y después las fotos.
        if (texto) await mandarTexto();
        for (const [i, f] of fotos.entries()) await mandarArchivo(f, i, false);
      }
    }
  } catch (e) {
    const falla = explicar(e);
    if (fotos.length > 1 && enviadas > 0) {
      refresh();
      return {
        ok: false,
        enviadas,
        mensaje: `Se enviaron ${enviadas} de ${fotos.length} fotos. ${falla} Toca enviar otra vez para mandar las que faltan.`,
      };
    }
    return { ok: false, mensaje: falla, enviadas };
  }

  // Si la IA había pasado la conversación, quien responde la atiende. Si la IA la tenía
  // (solo administración puede escribir ahí), la IA se retira.
  await tomarTraspasos(conv.id, usuario.id);
  if (conv.ai_attending) await retirarIA(conv.id);
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
  const bloqueo = sinPermisoParaResponder(usuario, conv);
  if (bloqueo) return bloqueo;
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
  clasificar = true,
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
  if (data?.id && clasificar) after(() => clasificarMensaje(data.id).catch((e) => console.error("clasificador", e)));
  return data?.id ?? null;
}

async function guardarAdjunto(admin: Admin, messageId: string, ruta: string, mime: string, tipo: "image" | "audio" = "image") {
  const { count } = await admin.from("attachments").select("id", { count: "exact", head: true }).eq("message_id", messageId);
  if (count) return; // el webhook ya lo guardó
  await admin.from("attachments").insert({ message_id: messageId, type: tipo, mime_type: mime, storage_path: ruta });
}

// ---------------------------------------------------------------------
// Acciones sobre la conversación (con la sesión del usuario: aplican las reglas RLS)
// ---------------------------------------------------------------------
export async function marcarLeida(conversationId: string) {
  const usuario = await getUsuarioActual();
  const sb = await createClient();
  const { data: c } = await sb
    .from("conversations")
    .select("kind, unread_count, assigned_to, external_conversation_id, canal:channel_accounts(zernio_account_id)")
    .eq("id", conversationId)
    .maybeSingle()
    .returns<{
      kind: string;
      unread_count: number;
      assigned_to: string | null;
      external_conversation_id: string;
      canal: { zernio_account_id: string };
    } | null>();
  if (!c) return;
  // Si la atiende otra persona, solo se mira: sigue sin leer para quien la atiende (y el cliente no ve "visto").
  if (c.assigned_to && c.assigned_to !== usuario.id) return;
  if (c.unread_count > 0) await sb.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
  if (c.kind === "dm") {
    // Igual que abrir el chat en la app: en Messenger e Instagram el cliente ve su mensaje como visto
    // y en Meta deja de aparecer sin leer. Se hace siempre al abrir (aunque la IA ya lo haya atendido).
    after(() => markConversationRead(c.external_conversation_id, c.canal.zernio_account_id).catch((e) => console.error("leído", e)));
  }
}

/** Mientras alguien escribe o graba: "escribiendo…" para el cliente (en WhatsApp además marca leído). */
export async function escribiendo(conversationId: string) {
  const usuario = await getUsuarioActual();
  const conv = await cargar(conversationId);
  if (!conv || conv.kind !== "dm" || sinPermisoParaResponder(usuario, conv)) return;
  if (!ventanaMensajes(conv.canal.platform, conv.last_inbound_at).puede) return;
  await vistoYEscribiendo(conv.external_conversation_id, conv.canal.zernio_account_id);
}

/** Solo administración asigna a otra persona. (Además lo impide la regla de la base de datos.) */
export async function asignar(conversationId: string, perfilId: string | null) {
  const usuario = await getUsuarioActual();
  if (usuario.rol !== "admin" && perfilId !== null && perfilId !== usuario.id) return;
  const sb = await createClient();
  await sb.from("conversations").update({ assigned_to: perfilId }).eq("id", conversationId);
  refresh();
}

/**
 * Tomar: ventas solo toma conversaciones libres que no esté atendiendo la IA
 * (la IA las habilita al pasarlas a vendedora). Administración puede tomar cualquiera.
 */
export async function tomar(conversationId: string) {
  const usuario = await getUsuarioActual();
  const sb = await createClient();
  let q = sb.from("conversations").update({ assigned_to: usuario.id }).eq("id", conversationId);
  if (usuario.rol !== "admin") q = q.is("assigned_to", null).eq("ai_attending", false);
  const { data } = await q.select("id");
  if (data?.length) {
    await tomarTraspasos(conversationId, usuario.id);
    if (usuario.rol === "admin") await retirarIA(conversationId);
  }
  refresh();
}

/** (Administración) Quita el chat a la IA y lo deja disponible para que lo tome ventas. */
export async function liberarParaVentas(conversationId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("conversations")
    .update({ ai_mode: "handoff", ai_attending: false, ai_attending_since: null })
    .eq("id", conversationId)
    .select("id");
  if (data?.length) {
    await admin.from("ai_handoffs").insert({ conversation_id: conversationId, reason: "Administración lo liberó para ventas.", summary: {} });
    after(() => avisarLiberado(conversationId).catch(() => null));
  }
  refresh();
}

/** Marca como atendidos los traspasos abiertos de la IA en esta conversación. */
async function tomarTraspasos(conversationId: string, perfilId: string) {
  const sb = await createClient();
  await sb
    .from("ai_handoffs")
    .update({ taken_by: perfilId, taken_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("taken_by", null);
}

/** Enciende o apaga la asesora IA en una conversación. */
export async function cambiarIAConversacion(conversationId: string, modo: "on" | "off") {
  await getUsuarioActual();
  const sb = await createClient();
  // La regla de la base de datos decide si esta persona puede (dueña del chat o administración).
  const { data } = await sb.from("conversations").update({ ai_mode: modo }).eq("id", conversationId).select("id");
  if (data?.length && modo === "off") await retirarIA(conversationId);
  refresh();
}

/** (Admin) Marca o desmarca un contacto para probar la IA en modo "Solo pruebas". */
export async function alternarContactoPrueba(contactId: string) {
  const usuario = await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "ai_contactos_prueba").maybeSingle();
  const lista = Array.isArray(data?.value) ? data.value.map(String) : [];
  const nueva = lista.includes(contactId) ? lista.filter((x) => x !== contactId) : [...lista, contactId];
  await admin
    .from("app_settings")
    .upsert({ key: "ai_contactos_prueba", value: nueva, updated_by: usuario.id }, { onConflict: "key" });
  refresh();
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
