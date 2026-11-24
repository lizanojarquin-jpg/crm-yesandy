// Resumen del día del CRM (asesora IA, ventas, seguimiento). Solo lee, no cambia nada.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/resumen-dia.mts [AAAA-MM-DD]
// Sin fecha: hoy en hora de Costa Rica.
import { createAdminClient } from "../src/lib/supabase/admin";
import { textoEtapa, type Etapa } from "../src/lib/inbox/etiquetas";

const db = createAdminClient();
const hoyCR = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const dia = process.argv[2] ?? hoyCR;
const inicio = new Date(`${dia}T00:00:00-06:00`);
const fin = new Date(inicio.getTime() + 86400e3);
/** Filtro de fechas del día, común a varias consultas (conserva el tipo de la consulta). */
function rango<Q>(q: Q, col = "created_at"): Q {
  const c = q as unknown as { gte: (k: string, v: string) => { lt: (k: string, v: string) => Q } };
  return c.gte(col, inicio.toISOString()).lt(col, fin.toISOString());
}
const horaCR = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3600e3).toISOString().slice(11, 16);
const nocturno = (iso: string) => {
  const [h, m] = horaCR(iso).split(":").map(Number);
  const min = h * 60 + m;
  return min < 8 * 60 + 30 || min >= 19 * 60;
};

// Mensajes de clientes
const { data: entrantes, error: eEntrantes } = await rango(
  db.from("messages").select("conversation_id, created_at, conversations(canal:channel_accounts(platform))").eq("direction", "inbound").limit(5000),
).returns<{ conversation_id: string; created_at: string; conversations: { canal: { platform: string } } }[]>();
if (eEntrantes) console.error("mensajes:", eEntrantes.message);
const porCanal: Record<string, number> = {};
for (const m of entrantes ?? []) porCanal[m.conversations.canal.platform] = (porCanal[m.conversations.canal.platform] ?? 0) + 1;
const clientes = new Set((entrantes ?? []).map((m) => m.conversation_id)).size;
const { count: nuevas } = await rango(db.from("conversations").select("id", { count: "exact", head: true }));

// Asesora IA
const { data: runs } = await rango(db.from("ai_runs").select("status, detail, cost_usd, created_at").limit(5000));
const cuenta = (s: string) => (runs ?? []).filter((r) => r.status === s).length;
const retomadas = (runs ?? []).filter((r) => r.status === "traspaso" && r.detail?.startsWith("Retomó"));
const errores = (runs ?? []).filter((r) => r.status === "error");
const tipoError = (d: string) =>
  /otra app/i.test(d) ? "Messenger: otra app controla la conversación" : /adjunto|attachment/i.test(d) ? "foto no enviada" : d.slice(0, 60);
const erroresPorTipo: Record<string, number> = {};
for (const e of errores) erroresPorTipo[tipoError(e.detail ?? "")] = (erroresPorTipo[tipoError(e.detail ?? "")] ?? 0) + 1;
const costo = (runs ?? []).reduce((t, r) => t + Number(r.cost_usd ?? 0), 0);
const deNoche = (runs ?? []).filter((r) => (r.status === "respondio" || r.status === "traspaso") && nocturno(r.created_at)).length;

// Traspasos a ventas y quién los tomó
const { data: traspasos } = await rango(
  db.from("ai_handoffs").select("reason, created_at, taken_at, tomo:profiles!ai_handoffs_taken_by_fkey(display_name, public_name)").limit(2000),
).returns<{ reason: string; created_at: string; taken_at: string | null; tomo: { display_name: string; public_name: string | null } | null }[]>();
const tomados = (traspasos ?? []).filter((t) => t.taken_at);
const minutosTomar = tomados.map((t) => (new Date(t.taken_at!).getTime() - new Date(t.created_at).getTime()) / 60000).sort((a, b) => a - b);
const mediana = minutosTomar.length ? Math.round(minutosTomar[Math.floor(minutosTomar.length / 2)]) : null;
const porVendedora: Record<string, number> = {};
for (const t of tomados) {
  const n = t.tomo ? (t.tomo.public_name ? `${t.tomo.display_name} · ${t.tomo.public_name}` : t.tomo.display_name) : "?";
  porVendedora[n] = (porVendedora[n] ?? 0) + 1;
}

// Mensajes del equipo por persona (desde el CRM)
const { data: equipo } = await rango(
  db.from("messages").select("sender_profile_id, perfil:profiles(display_name, public_name)").eq("sender_type", "agent").not("sender_profile_id", "is", null).limit(5000),
).returns<{ sender_profile_id: string; perfil: { display_name: string; public_name: string | null } | null }[]>();
const mensajesEquipo: Record<string, number> = {};
for (const m of equipo ?? []) {
  const n = m.perfil ? (m.perfil.public_name ? `${m.perfil.display_name} · ${m.perfil.public_name}` : m.perfil.display_name) : "?";
  mensajesEquipo[n] = (mensajesEquipo[n] ?? 0) + 1;
}
const { count: desdeApps } = await rango(
  db.from("messages").select("id", { count: "exact", head: true }).eq("sender_type", "agent").is("sender_profile_id", null),
);

// Seguimiento automático
const { data: etapas } = await rango(db.from("stage_events").select("to_stage").eq("source", "ai").limit(2000));
const etapasIA: Record<string, number> = {};
for (const e of (etapas ?? []) as { to_stage: Etapa }[]) etapasIA[textoEtapa(e.to_stage)] = (etapasIA[textoEtapa(e.to_stage)] ?? 0) + 1;

// Clientes esperando respuesta ahora (último mensaje del cliente, hace más de 1 h)
const { data: abiertas } = await db
  .from("conversations")
  .select("last_inbound_at, last_message_at, ai_attending, contacto:contacts(name, phone)")
  .eq("status", "open")
  .eq("kind", "dm")
  .lt("last_inbound_at", new Date(Date.now() - 3600e3).toISOString())
  .gte("last_inbound_at", new Date(Date.now() - 48 * 3600e3).toISOString())
  .limit(500)
  .returns<{ last_inbound_at: string; last_message_at: string; ai_attending: boolean; contacto: { name: string | null; phone: string | null } }[]>();
const esperando = (abiertas ?? [])
  .filter((c) => new Date(c.last_message_at).getTime() - new Date(c.last_inbound_at).getTime() <= 1000)
  .sort((a, b) => a.last_inbound_at.localeCompare(b.last_inbound_at));

const lista = (o: Record<string, number>) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ") || "ninguno";

console.log(`RESUMEN DEL ${dia} (hora de Costa Rica)

CLIENTES
- Mensajes recibidos: ${entrantes?.length ?? 0} de ${clientes} clientes (${lista(porCanal)})
- Conversaciones nuevas: ${nuevas ?? 0}

ASESORA IA
- Respondió: ${cuenta("respondio")} veces · pasó a ventas: ${cuenta("traspaso") - retomadas.length} clientes · retomó clientes en espera: ${retomadas.length}
- Atendió fuera de horario (antes de 8:30 a. m. o después de 7 p. m.): ${deNoche}
- No respondió (una persona atendía, etapa avanzada, etc.): ${cuenta("omitido")}
- Errores: ${errores.length} (${lista(erroresPorTipo)})
- Costo del día: US$ ${costo.toFixed(3)}
${retomadas.length ? `- Retomados:\n${retomadas.map((r) => `  · ${horaCR(r.created_at)} ${r.detail!.slice(0, 160)}`).join("\n")}` : ""}
VENTAS
- Traspasos de la IA: ${traspasos?.length ?? 0} · tomados: ${tomados.length} · sin tomar: ${(traspasos?.length ?? 0) - tomados.length}
- Tiempo típico en tomar un cliente: ${mediana === null ? "sin datos" : `${mediana} min`}
- Tomados por: ${lista(porVendedora)}
- Mensajes enviados desde el CRM: ${lista(mensajesEquipo)} · desde las apps del celular o Business Suite: ${desdeApps ?? 0}

SEGUIMIENTO AUTOMÁTICO
- Etapas detectadas por la IA: ${lista(etapasIA)}

ESPERANDO RESPUESTA AHORA (último mensaje del cliente hace más de 1 h, últimas 48 h)
- ${esperando.length} clientes${esperando.length ? `. Los que más llevan:\n${esperando
  .slice(0, 8)
  .map((c) => `  · ${c.contacto.name ?? c.contacto.phone ?? "sin nombre"} desde las ${horaCR(c.last_inbound_at)}${c.ai_attending ? " (la IA lo atiende)" : ""}`)
  .join("\n")}` : ""}`);
