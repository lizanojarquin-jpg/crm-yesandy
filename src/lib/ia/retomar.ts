import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarConvIA, enviarRespuesta, estadoTienda, historialParaIA, leerAjustesIA, pensar, traspasar } from "./asesora";

// Retomar clientes que esperan (decisión de Allan, rige desde el 24-nov):
// si el equipo ya atendía a un cliente y el cliente lleva más de N horas esperando respuesta
// (retomar_horas: 18 desde el 25-nov, antes 6 horas hábiles), la IA le escribe para retomar la
// conversación y la devuelve a la bandeja para que la tome la misma vendedora u otra.
// Se cuentan horas de reloj: Meta solo deja escribir texto libre hasta 24 h después del último
// mensaje del cliente, así que 18 horas hábiles casi nunca cabrían. La IA escribe solo con la
// tienda abierta (desde las 8:30).

const MINUTOS_ENTRE_REVISIONES = 10;
const MAX_POR_REVISION = 5; // para no pasarse del tiempo de la función
const VENTANA_META_MS = 23 * 3600_000; // fuera de 24 h Meta no deja escribir texto libre

const AUTOMATICO_MS = 20_000;

const instruccion = (horas: number) =>
  `El cliente escribió hace unas ${horas} horas y nadie del equipo le respondió. ` +
  "Escribe UN solo mensaje corto y cálido para retomar: pide disculpas por la demora, retoma lo último que pidió o preguntó, " +
  "y dile que una asesora del equipo le confirma enseguida (o pregúntale si todavía le interesa). " +
  "No te vuelvas a presentar si ya hay mensajes del equipo o tuyos en la conversación. " +
  "No hagas una asesoría nueva, no propongas productos y no des precios. Usa responder con productos vacíos y pasar_a_vendedora = true.";

/** Minutos con la tienda abierta entre dos momentos (L-S 8:30-19:00, D 9:00-15:00, hora de Costa Rica). */
export function minutosHabiles(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0;
  const CR = 6 * 3600_000;
  let total = 0;
  // Se recorre día por día en hora de Costa Rica.
  const inicioDia = (t: number) => {
    const d = new Date(t - CR);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + CR;
  };
  for (let dia = inicioDia(desde.getTime()); dia < hasta.getTime(); dia += 86400_000) {
    const semana = new Date(dia - CR + 12 * 3600_000).getUTCDay();
    const [abre, cierra] = semana === 0 ? [9 * 60, 15 * 60] : [8 * 60 + 30, 19 * 60];
    const a = Math.max(desde.getTime(), dia + abre * 60_000);
    const b = Math.min(hasta.getTime(), dia + cierra * 60_000);
    if (b > a) total += (b - a) / 60_000;
  }
  return Math.round(total);
}

/** Una revisión como mucho cada 10 minutos, aunque lleguen muchos mensajes a la vez. */
async function tocaRevisar(): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("value").eq("key", "retomar_ultima_revision").maybeSingle();
  const anterior = typeof data?.value === "string" ? data.value : "2000-01-01T00:00:00Z";
  if (Date.now() - new Date(anterior).getTime() < MINUTOS_ENTRE_REVISIONES * 60_000) return false;
  // Solo gana quien logra cambiar el valor que leyó (si dos revisan a la vez, una sola sigue).
  const { data: ganada } = await db
    .from("app_settings")
    .update({ value: new Date().toISOString() })
    .eq("key", "retomar_ultima_revision")
    .eq("value", JSON.stringify(anterior))
    .select("key");
  return Boolean(ganada?.length);
}

type Candidata = {
  id: string;
  ai_mode: string;
  assigned_to: string | null;
  last_inbound_at: string;
  last_message_at: string;
  ai_revived_message_id: string | null;
  contact_id: string;
};

/**
 * Busca clientes esperando y los retoma. `forzar` salta el límite de cada 10 min y el horario
 * (solo para pruebas); `soloProbar` no envía nada, solo dice qué haría.
 */
export async function retomarConversaciones(
  opciones: { forzar?: boolean; soloProbar?: boolean; verTexto?: boolean; desde?: string } = {},
): Promise<string[]> {
  const ajustes = await leerAjustesIA();
  if (ajustes.modo === "apagada" && !opciones.soloProbar) return ["IA apagada"];
  if (!opciones.forzar) {
    if (!estadoTienda().abierta) return ["tienda cerrada"];
    if (!(await tocaRevisar())) return ["revisado hace poco"];
  }

  const db = createAdminClient();
  const { data: cfg } = await db.from("app_settings").select("key, value").in("key", ["retomar_desde", "retomar_horas"]);
  const valor = new Map((cfg ?? []).map((r) => [r.key, r.value]));
  const desde = new Date(opciones.desde ?? String(valor.get("retomar_desde") ?? "2026-11-24T00:00:00-06:00"));
  const horas = Number(valor.get("retomar_horas") ?? 18);
  const limiteVentana = new Date(Date.now() - VENTANA_META_MS);
  const inicio = new Date(Math.max(desde.getTime(), limiteVentana.getTime()));

  const { data } = await db
    .from("conversations")
    .select("id, ai_mode, assigned_to, last_inbound_at, last_message_at, ai_revived_message_id, contact_id")
    .eq("kind", "dm")
    .eq("status", "open")
    .eq("ai_attending", false)
    .gte("last_inbound_at", inicio.toISOString())
    .lte("last_inbound_at", new Date(Date.now() - horas * 3600_000).toISOString())
    .limit(300)
    .returns<Candidata[]>();

  const log: string[] = [];
  let hechas = 0;
  for (const c of data ?? []) {
    if (hechas >= MAX_POR_REVISION) break;
    // El último mensaje es del cliente (nadie le respondió después).
    if (new Date(c.last_message_at).getTime() - new Date(c.last_inbound_at).getTime() > 1000) continue;
    if (ajustes.modo === "pruebas" && !opciones.soloProbar && !ajustes.contactosPrueba.includes(c.contact_id)) continue;

    const { hist, turnos } = await historialParaIA(c.id);
    const ultimoCliente = [...hist].reverse().find((m) => m.direction === "inbound");
    if (!ultimoCliente || c.ai_revived_message_id === ultimoCliente.id) continue;

    // Solo si el equipo ya estaba atendiendo (escribió una persona) o la IA ya lo había pasado a ventas.
    const escribioPersona = hist.some((m, i) => {
      if (m.sender_type !== "agent") return false;
      const previo = hist[i - 1];
      return !(previo?.direction === "inbound" && new Date(m.created_at).getTime() - new Date(previo.created_at).getTime() < AUTOMATICO_MS);
    });
    if (!escribioPersona && c.ai_mode !== "handoff" && !c.assigned_to) continue;

    const conv = await cargarConvIA(c.id);
    if (!conv) continue;
    const espera = Math.round((Date.now() - new Date(c.last_inbound_at).getTime()) / 3600_000);

    if (opciones.soloProbar) {
      let texto = "";
      if (opciones.verTexto) {
        const d = await pensar({ turnos, canal: conv.canal.platform, nombre: conv.contacto.name, etapa: conv.contacto.stage, extra: instruccion(espera) });
        texto = ` → "${d.texto}"`;
      }
      log.push(`retomaría ${c.id} (espera ${espera} h)${texto}`);
      hechas++;
      continue;
    }

    // Se reserva antes de escribir: si otra revisión llega al mismo tiempo, no escribe dos veces.
    const { data: reservada } = await db
      .from("conversations")
      .update({ ai_revived_message_id: ultimoCliente.id })
      .eq("id", c.id)
      .or(`ai_revived_message_id.is.null,ai_revived_message_id.neq.${ultimoCliente.id}`)
      .select("id");
    if (!reservada?.length) continue;

    try {
      const d = await pensar({
        turnos,
        canal: conv.canal.platform,
        nombre: conv.contacto.name,
        etapa: conv.contacto.stage,
        extra: instruccion(espera),
      });
      const decision = { ...d, productos: [] };
      const runId = crypto.randomUUID();
      await enviarRespuesta(conv, runId, decision);
      await traspasar(conv, `El cliente esperaba respuesta hace ${espera} h: la IA retomó la conversación.`, d.resumen, { liberar: true });
      // Registro para Configuración → Asesora IA (se usa el mensaje que envió la IA como referencia).
      const { data: enviado } = await db
        .from("messages")
        .select("id")
        .eq("conversation_id", c.id)
        .eq("sender_type", "ai")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (enviado) {
        await db.from("ai_runs").insert({
          conversation_id: c.id,
          trigger_message_id: enviado.id,
          status: "traspaso",
          detail: `Retomó tras ${espera} h de espera · ${d.texto}`.slice(0, 1000),
          cost_usd: d.costo,
          finished_at: new Date().toISOString(),
        });
      }
      log.push(`retomada ${c.id}: ${d.texto}`);
      hechas++;
    } catch (e) {
      // Se quita la reserva para intentarlo en la próxima revisión.
      await db.from("conversations").update({ ai_revived_message_id: c.ai_revived_message_id }).eq("id", c.id);
      log.push(`error ${c.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return log.length ? log : ["nada que retomar"];
}
