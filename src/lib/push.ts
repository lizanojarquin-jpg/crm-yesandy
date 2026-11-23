import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerAjustesIA } from "@/lib/ia/asesora";

// Notificaciones al celular o la computadora del equipo (Web Push con claves VAPID).

let configurado: boolean | null = null;
function configurar(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return (configurado = false);
  setVapidDetails(process.env.VAPID_SUBJECT || "https://crm.yesandycr.com", publica, privada);
  return (configurado = true);
}

export type Aviso = { titulo: string; cuerpo: string; url: string; tag?: string };

/** Envía el aviso a los dispositivos de esas personas (o de todo el equipo activo si no se indica). */
export async function avisar(aviso: Aviso, perfiles?: string[]): Promise<number> {
  if (!configurar()) return 0;
  const db = createAdminClient();
  const { data: activos } = await db.from("profiles").select("id").eq("active", true);
  const permitidos = new Set((activos ?? []).map((p) => p.id));
  const destino = (perfiles?.length ? perfiles : [...permitidos]).filter((id) => permitidos.has(id));
  if (!destino.length) return 0;

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("profile_id", destino);
  if (!subs?.length) return 0;

  const carga = JSON.stringify({
    titulo: aviso.titulo.slice(0, 80),
    cuerpo: aviso.cuerpo.slice(0, 180),
    url: aviso.url,
    tag: aviso.tag,
  });
  const resultados = await Promise.allSettled(
    subs.map((s) =>
      sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
        TTL: 60 * 60,
        urgency: "high",
      }),
    ),
  );
  // Dispositivos que ya no existen (desinstalaron o quitaron el permiso): se borran.
  const vencidas = subs.filter((_, i) => {
    const r = resultados[i];
    const code = r.status === "rejected" ? (r.reason as { statusCode?: number })?.statusCode : undefined;
    return code === 404 || code === 410;
  });
  if (vencidas.length) await db.from("push_subscriptions").delete().in("id", vencidas.map((s) => s.id));
  return resultados.filter((r) => r.status === "fulfilled").length;
}

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", facebook: "Messenger", instagram: "Instagram", tiktok: "TikTok" };
const ETAPAS_IA = ["new", "advising", "no_response"];

type ConvAviso = {
  id: string;
  kind: "dm" | "comment";
  ai_mode: "on" | "off" | "handoff";
  assigned_to: string | null;
  contacto: { id: string; name: string | null; phone: string | null; stage: string };
  canal: { platform: string };
};

async function conversacion(id: string) {
  const { data } = await createAdminClient()
    .from("conversations")
    .select("id, kind, ai_mode, assigned_to, contacto:contacts(id, name, phone, stage), canal:channel_accounts(platform)")
    .eq("id", id)
    .maybeSingle()
    .returns<ConvAviso | null>();
  return data;
}

const nombre = (c: ConvAviso) => c.contacto.name?.trim() || c.contacto.phone || "Cliente";
/** Si la conversación tiene quien la atienda, solo a esa persona; si no, a todo el equipo. */
const destinatarios = (c: ConvAviso) => (c.assigned_to ? [c.assigned_to] : undefined);

/** Mensaje o comentario nuevo de un cliente. */
export async function avisarMensajeNuevo(conversationId: string, texto: string | null, adjuntos: number) {
  const c = await conversacion(conversationId);
  if (!c) return;
  // Si la asesora IA está atendiendo esta conversación, no se avisa cada mensaje: se avisa al pasar a vendedora.
  if (c.kind === "dm" && c.ai_mode === "on" && !c.assigned_to && ETAPAS_IA.includes(c.contacto.stage)) {
    const { modo, contactosPrueba } = await leerAjustesIA();
    if (modo === "encendida" || (modo === "pruebas" && contactosPrueba.includes(c.contacto.id))) return;
  }
  const canal = CANAL[c.canal.platform] ?? c.canal.platform;
  const cuerpo = texto?.trim() || (adjuntos ? "📷 Envió una foto o un archivo" : "Mensaje nuevo");
  await avisar(
    {
      titulo: `${nombre(c)} · ${c.kind === "comment" ? `comentario en ${canal}` : canal}`,
      cuerpo,
      url: `/c/${c.id}`,
      tag: `conv-${c.id}`,
    },
    destinatarios(c),
  );
}

/** La asesora IA pasó la conversación a una persona. */
export async function avisarTraspaso(conversationId: string, motivo: string) {
  const c = await conversacion(conversationId);
  if (!c) return;
  await avisar(
    { titulo: `La IA pasó a ${nombre(c)} a vendedora`, cuerpo: motivo, url: `/c/${c.id}`, tag: `conv-${c.id}` },
    destinatarios(c),
  );
}

/** La IA no pudo responder: el chat sigue bloqueado para ventas, así que se avisa solo a administración. */
export async function avisarFallaIA(conversationId: string) {
  const c = await conversacion(conversationId);
  if (!c) return;
  const { data: admins } = await createAdminClient().from("profiles").select("id").eq("role", "admin").eq("active", true);
  if (!admins?.length) return;
  await avisar(
    {
      titulo: `⚠️ La IA no pudo responder a ${nombre(c)}`,
      cuerpo: "Responde tú o toca «Liberar para ventas» en la conversación.",
      url: `/c/${c.id}`,
      tag: `falla-${c.id}`,
    },
    admins.map((a) => a.id),
  );
}

/** Administración liberó un chat que tenía la IA: ya lo puede tomar ventas. */
export async function avisarLiberado(conversationId: string) {
  const c = await conversacion(conversationId);
  if (!c) return;
  await avisar({ titulo: `${nombre(c)} está disponible para tomar`, cuerpo: "Administración lo liberó para ventas.", url: `/c/${c.id}`, tag: `conv-${c.id}` });
}

/** El seguimiento automático detectó un comprobante de pago. */
export async function avisarPago(conversationId: string, nota: string) {
  const c = await conversacion(conversationId);
  if (!c) return;
  await avisar(
    { titulo: `💰 Comprobante de pago · ${nombre(c)}`, cuerpo: nota || "Revisa y confirma el pago.", url: `/c/${c.id}`, tag: `pago-${c.id}` },
    destinatarios(c),
  );
}
