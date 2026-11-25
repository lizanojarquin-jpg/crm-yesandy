// Completa los mensajes ya guardados con lo que el webhook no trae: el mensaje citado ("responder")
// y las coordenadas de las ubicaciones. Lo lee de la lista de mensajes de Zernio.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/recuperar-citas.mts [días=7]
import { createAdminClient } from "../src/lib/supabase/admin";
import { extrasDe, guardarExtras } from "../src/lib/zernio/extras";
import type { ZernioListedMessage } from "../src/lib/zernio/client";

const dias = Number(process.argv[2] ?? 7);
const desde = new Date(Date.now() - dias * 86400e3).toISOString();
const KEY = process.env.ZERNIO_API_KEY!;
const db = createAdminClient();

const { data: convs, error } = await db
  .from("conversations")
  .select("id, external_conversation_id, canal:channel_accounts!inner(platform, zernio_account_id)")
  .eq("kind", "dm")
  .neq("canal.platform", "tiktok")
  .gte("last_message_at", desde)
  .limit(2000)
  .returns<{ id: string; external_conversation_id: string; canal: { platform: string; zernio_account_id: string } }[]>();
if (error) throw error;

let revisadas = 0;
let citas = 0;
let ubicaciones = 0;
let sinEncontrar = 0;
for (const c of convs ?? []) {
  const conExtras: ZernioListedMessage[] = [];
  let cursor: string | undefined;
  // Del más nuevo al más viejo, hasta pasar la fecha (máx. 3 páginas de 100).
  for (let pagina = 0; pagina < 3; pagina++) {
    const url = new URL(`https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(c.external_conversation_id)}/messages`);
    url.searchParams.set("accountId", c.canal.zernio_account_id);
    url.searchParams.set("limit", "100");
    url.searchParams.set("sortOrder", "desc");
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) {
      console.log("zernio", r.status, c.id);
      break;
    }
    const j = (await r.json()) as { messages?: ZernioListedMessage[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } };
    const ms = j.messages ?? [];
    conExtras.push(...ms.filter((m) => m.metadata?.quotedMessageId || m.metadata?.location));
    const masViejo = ms.at(-1)?.createdAt ?? ms.at(-1)?.sentAt;
    if (!j.pagination?.hasMore || !j.pagination.nextCursor || (masViejo && masViejo < desde)) break;
    cursor = j.pagination.nextCursor;
  }
  revisadas++;
  if (!conExtras.length) continue;
  const { data: guardados } = await db
    .from("messages")
    .select("id, external_message_id, reply_to_external_id, location")
    .eq("conversation_id", c.id)
    .in("external_message_id", conExtras.map((m) => m.id));
  const porId = new Map((guardados ?? []).map((g) => [g.external_message_id, g]));
  for (const m of conExtras) {
    const g = porId.get(m.id);
    if (!g) {
      sinEncontrar++;
      continue;
    }
    const e = extrasDe(m);
    const falta = { citado: g.reply_to_external_id ? null : e.citado, ubicacion: g.location ? null : e.ubicacion };
    if (await guardarExtras(g.id, falta)) {
      if (falta.citado) citas++;
      if (falta.ubicacion) ubicaciones++;
    }
  }
}
console.log(`Conversaciones revisadas: ${revisadas} · citas recuperadas: ${citas} · ubicaciones: ${ubicaciones} · no estaban en el CRM: ${sinEncontrar}`);
