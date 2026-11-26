// Completa los mensajes ya guardados con el anuncio del que vino el cliente. Ese dato solo llega en el
// webhook (la lista de mensajes de Zernio no lo trae), así que se lee de los webhooks guardados.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/recuperar-anuncios.mts
import { createAdminClient } from "../src/lib/supabase/admin";
import { guardarAnuncio, type MetadataWebhook } from "../src/lib/zernio/extras";

const db = createAdminClient();
type Evento = { payload: { metadata?: MetadataWebhook; message?: { id: string; platformMessageId?: string | null; direction?: string } } };

let leidos = 0;
let conAnuncio = 0;
let guardados = 0;
let conMiniatura = 0;
let yaEstaban = 0;
let sinMensaje = 0;
// De a 250: los webhooks pesan y páginas más grandes se pasan del tiempo máximo de la base.
for (let desde = 0; ; desde += 250) {
  const { data, error } = await db
    .from("webhook_events")
    .select("payload")
    .eq("event_type", "message.received")
    .order("received_at")
    .range(desde, desde + 249)
    .returns<Evento[]>();
  if (error) throw error;
  if (!data?.length) break;
  leidos += data.length;
  for (const { payload: p } of data) {
    if (!p.metadata?.referral || !p.message || p.message.direction === "outgoing") continue;
    conAnuncio++;
    const ids = [p.message.platformMessageId, p.message.id].filter(Boolean) as string[];
    const { data: m } = await db
      .from("messages")
      .select("id, ad_referral")
      .in("external_message_id", ids)
      .limit(1)
      .maybeSingle()
      .returns<{ id: string; ad_referral: { imagen?: string | null } | null } | null>();
    if (!m) {
      sinMensaje++;
      continue;
    }
    // Los que ya tienen miniatura no se tocan; los que no, se reintentan.
    if (m.ad_referral?.imagen) {
      yaEstaban++;
      continue;
    }
    const a = await guardarAnuncio(m.id, p.metadata);
    if (a) {
      guardados++;
      if (a.imagen) conMiniatura++;
    }
  }
}
console.log(
  `Webhooks leídos: ${leidos} · con anuncio: ${conAnuncio} · guardados: ${guardados} (con miniatura: ${conMiniatura}) · ya estaban: ${yaEstaban} · sin mensaje en el CRM: ${sinMensaje}`,
);
