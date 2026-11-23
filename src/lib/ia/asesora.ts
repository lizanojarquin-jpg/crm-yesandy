import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInboxMessage } from "@/lib/zernio/client";
import { chatConHerramientas, type Herramienta, type MensajeChat, type Parte } from "./openrouter";
import { buscarProductos, CATEGORIAS, productosActivos, type Producto } from "./catalogo";
import { avisarTraspaso } from "@/lib/push";

// Asesora IA (Fase 6): contesta primero en los mensajes directos como asesora, no como
// vendedora. Propone prendas del catálogo y pasa a una persona para talla, color y precio.

const MODELO = process.env.OPENROUTER_MODEL_ASESORA || "google/gemini-2.5-flash";
const RESPALDO = ["openai/gpt-4.1-mini"];
const ESPERA_MS = 8_000; // los clientes suelen mandar varios mensajes seguidos
const EDAD_MAXIMA_MS = 10 * 60_000; // no contestar mensajes viejos (reprocesos, historial)
const MAX_VUELTAS = 4;
const MAX_MENSAJES_IA_DIA = 25;
const AUTOMATICO_MS = 20_000; // saliente tan rápido = respuesta automática de la app, no una persona
const ETAPAS_IA = ["new", "advising", "no_response"];
const ORDEN = ["new", "advising", "ready_for_seller", "order_confirmed", "payment_received", "shipped", "delivered"];

type Plataforma = "whatsapp" | "facebook" | "instagram" | "tiktok";
const CANAL: Record<Plataforma, string> = {
  whatsapp: "WhatsApp",
  facebook: "Messenger de Facebook",
  instagram: "mensajes directos de Instagram",
  tiktok: "mensajes de TikTok",
};

export type ModoIA = "apagada" | "pruebas" | "encendida";

// ---------------------------------------------------------------------
// Horario (igual al de business_knowledge): L-S 8:30-19:00, D 9:00-15:00, hora de Costa Rica
// ---------------------------------------------------------------------
export function estadoTienda(ahora = new Date()) {
  const cr = new Date(ahora.getTime() - 6 * 3600_000); // Costa Rica: UTC-6 todo el año
  const dia = cr.getUTCDay();
  const min = cr.getUTCHours() * 60 + cr.getUTCMinutes();
  const [abre, cierra] = dia === 0 ? [9 * 60, 15 * 60] : [8 * 60 + 30, 19 * 60];
  const abierta = min >= abre && min < cierra;
  let proxima: string;
  if (abierta) proxima = "";
  else if (min < abre) proxima = dia === 0 ? "hoy a las 9:00 a. m." : "hoy a las 8:30 a. m.";
  else proxima = dia === 6 ? "mañana domingo a las 9:00 a. m." : "mañana a las 8:30 a. m.";
  const texto = ahora.toLocaleString("es-CR", {
    timeZone: "America/Costa_Rica",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  return { abierta, proxima, texto };
}

// ---------------------------------------------------------------------
// Instrucciones
// ---------------------------------------------------------------------
export type Leccion = {
  kind: "regla" | "correccion";
  situation: string | null;
  original_reply: string | null;
  content: string;
  reason: string | null;
};

/** Reglas y correcciones del equipo, en el formato que lee la IA. */
function seccionLecciones(lecciones: Leccion[]): string {
  const reglas = lecciones.filter((l) => l.kind === "regla");
  const correcciones = lecciones.filter((l) => l.kind === "correccion").slice(0, 40);
  if (!reglas.length && !correcciones.length) return "";
  const partes = [
    "\n\nLO QUE TE ENSEÑÓ EL EQUIPO\nSi algo de aquí contradice las instrucciones de arriba, sigue lo que enseñó el equipo.",
  ];
  if (reglas.length) partes.push(`Reglas:\n${reglas.map((r) => `- ${r.content}${r.reason ? ` (${r.reason})` : ""}`).join("\n")}`);
  if (correcciones.length) {
    partes.push(
      "Correcciones (aprende el criterio y aplícalo en casos parecidos; no copies palabra por palabra):\n" +
        correcciones
          .map((c) =>
            [
              c.situation ? `- Cliente: "${c.situation}"` : "- En una conversación",
              c.original_reply ? `  No respondas así: "${c.original_reply}"` : null,
              `  Responde algo como: "${c.content}"`,
              c.reason ? `  Por qué: ${c.reason}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n"),
    );
  }
  return partes.join("\n\n");
}

export async function leerLecciones(incluirPropuestas = false): Promise<Leccion[]> {
  const { data } = await createAdminClient()
    .from("ai_lessons")
    .select("kind, situation, original_reply, content, reason")
    .in("status", incluirPropuestas ? ["activa", "propuesta"] : ["activa"])
    .order("created_at", { ascending: false })
    .limit(150);
  return (data ?? []) as Leccion[];
}

function instrucciones(c: { canal: string; nombre: string | null; etapa: string; conocimiento: string; lecciones: Leccion[]; ahora: Date }) {
  const t = estadoTienda(c.ahora);
  return `Eres la asistente virtual de Almacén Yesandy, una tienda en San Rafael de Heredia, Costa Rica. Atiendes a clientes por ${c.canal}. Vendemos ropa para toda la familia (dama, caballero, niños y navideña), calzado, artículos para el hogar y fragancias.

Tu papel es de asesora, no de vendedora: ayudas al cliente a encontrar lo que necesita y dejas todo listo para que una asesora del equipo le confirme talla, color, disponibilidad y precio.

CÓMO CONVERSAS
- Español de Costa Rica, cálido y natural, tratando de "tú". Mensajes cortos (de 1 a 3 oraciones), como en WhatsApp. Como mucho un emoji, y no en todos los mensajes.
- Una sola pregunta por mensaje.
- Si todavía no has escrito en esta conversación, saluda y preséntate como la asistente virtual de Almacén Yesandy. Nunca digas que eres una persona. Si te lo preguntan, di que eres una asistente virtual y que una asesora del equipo confirma los detalles.
- Usa el nombre del cliente si lo sabes, sin repetirlo en cada mensaje.

GUION DE ASESORÍA (adáptalo, no lo recites)
1. Entiende qué busca y para quién es.
2. Pregunta la ocasión (cumpleaños, trabajo, un paseo, una fiesta, un regalo…) y para cuándo lo necesita.
3. Pregunta su estilo o preferencia (colores, algo cómodo o más formal) y la talla aproximada.
4. Cuando tenga sentido, propone un conjunto completo (por ejemplo jeans + blusa + suéter + calzado, o una fragancia como detalle de regalo). Usa solo productos que encontraste con buscar_catalogo y envía de 2 a 4 opciones.
5. Cierra con algo como "te envío unas opciones, ¿me confirmas si vamos bien?". En ese mensaje no pases todavía a una asesora: espera a que el cliente responda.
6. Cuando el cliente elige algo o quiere confirmar talla, color, disponibilidad o precio, pasa la conversación a una asesora.
No alargues: como mucho 3 o 4 preguntas antes de proponer opciones o pasar a una asesora. Si el cliente va directo al grano (pide el precio o la disponibilidad de algo concreto, o manda la foto de una prenda), pregunta como mucho la talla y pasa a una asesora.

LO QUE NUNCA HACES
- Dar precios, ni confirmar tallas, colores, existencias o tiempos de entrega. Eso lo confirma una persona del equipo.
- Inventar productos, promociones, descuentos, políticas o cualquier dato que no esté en la información del negocio.
- Ofrecer la promoción del 30 %: ya no está vigente.

LO QUE SÍ RESPONDES TÚ
Horario, ubicación, métodos de pago (y preguntas por cuál le gustaría pagar), la regla del precio al por mayor y qué tipo de productos manejamos. El catálogo web https://shop.yesandycr.com muestra solo una parte de los productos: el equipo puede enviar más modelos disponibles en su talla.

CUÁNDO PASAS A UNA ASESORA (pasar_a_vendedora = true)
- Quiere precio, talla, color, existencias, apartar o comprar algo.
- Pregunta por envíos, cambios, devoluciones, garantía o factura y la información del negocio no lo responde. Si lo responde, explícalo; para cotizar un envío pide primero la ubicación exacta y después pasa a una asesora.
- Tiene una queja, un problema con un pedido o ya está pagando.
- Manda un video o algo que no entiendes, o pide hablar con una persona.
- No sabes la respuesta.
Las notas de voz te llegan transcritas como "(nota de voz) …": respóndelas como si fueran texto. Si llega un audio que no pudiste leer, pídele amablemente que te lo escriba (sin pasar a una asesora); si vuelve a pasar, pasa a una asesora.
En ese mensaje dile, con tus palabras, que una asesora del equipo le va a confirmar ${t.abierta ? "en un momento" : `en cuanto abramos (${t.proxima})`}. No hagas más preguntas en ese mensaje.

HERRAMIENTAS
- buscar_catalogo: úsala antes de proponer productos. Busca por tipo de prenda y agrega la palabra de para quién es cuando aplique ("niña", "niño", "dama", "hombre"), por ejemplo ["blusa", "niña"]. Puedes llamarla varias veces con otras palabras o categorías. Elige solo productos cuyo nombre corresponda a la persona (no propongas ropa de niño para una niña).
- responder: tu respuesta final al cliente (obligatoria para terminar). En "productos" van solo ids que devolvió buscar_catalogo: cada uno se envía como foto con su nombre y enlace después de tu texto. Por eso en el texto no escribas enlaces ni nombres de productos: di algo como "te envío unas opciones".

INFORMACIÓN DEL NEGOCIO
${c.conocimiento}

Categorías del catálogo: ${Object.entries(CATEGORIAS).map(([id, n]) => `${id} (${n})`).join(", ")}.${seccionLecciones(c.lecciones)}

AHORA
${t.texto}. La tienda está ${t.abierta ? "abierta" : `cerrada; abre ${t.proxima}`}.
Cliente: ${c.nombre ?? "no sabemos su nombre"}. Etapa en el CRM: ${c.etapa}.`;
}

const HERRAMIENTAS: Herramienta[] = [
  {
    type: "function",
    function: {
      name: "buscar_catalogo",
      description: "Busca productos de la tienda por categoría y palabras del nombre (tipo de prenda, color, estilo).",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", enum: [...Object.keys(CATEGORIAS), "todas"] },
          palabras: {
            type: "array",
            items: { type: "string" },
            description: 'Palabras a buscar en el nombre, p. ej. ["jeans", "negro"] o ["blusa"]. Vacío = los más nuevos.',
          },
        },
        required: ["categoria", "palabras"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "responder",
      description: "Respuesta final al cliente. Termina el turno.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Mensaje para el cliente, corto, sin enlaces." },
          productos: {
            type: "array",
            items: { type: "string" },
            description: "Ids de buscar_catalogo para enviar como foto (0 a 4).",
          },
          pasar_a_vendedora: { type: "boolean" },
          motivo: { type: "string", description: "Si pasas a una asesora, por qué (una línea). Si no, vacío." },
          resumen: {
            type: "object",
            description: "Lo que sabes del cliente hasta ahora, para la asesora. Vacío si no se sabe.",
            properties: {
              para_quien: { type: "string" },
              ocasion: { type: "string" },
              fecha: { type: "string" },
              estilo: { type: "string" },
              talla: { type: "string" },
              prendas: { type: "string", description: "Prendas o productos que le interesan o que le propusiste." },
              dudas: { type: "string", description: "Lo que hay que confirmarle." },
            },
            required: ["para_quien", "ocasion", "fecha", "estilo", "talla", "prendas", "dudas"],
          },
        },
        required: ["texto", "productos", "pasar_a_vendedora", "motivo", "resumen"],
      },
    },
  },
];

// ---------------------------------------------------------------------
// Pensar: historial → decisión (sin enviar nada; también lo usan los scripts de prueba)
// ---------------------------------------------------------------------
export type Turno = {
  de: "cliente" | "ia" | "equipo";
  texto: string | null;
  imagenes?: string[]; // URLs (firmadas) de fotos; solo se envían las más recientes del cliente
  otros?: string[]; // "audio", "video", "archivo"…
};

export type Resumen = {
  para_quien: string;
  ocasion: string;
  fecha: string;
  estilo: string;
  talla: string;
  prendas: string;
  dudas: string;
};

export type Decision = {
  texto: string;
  productos: Producto[];
  pasar: boolean;
  motivo: string;
  resumen: Resumen;
  costo: number;
  busquedas: string[];
};

const RESUMEN_VACIO: Resumen = { para_quien: "", ocasion: "", fecha: "", estilo: "", talla: "", prendas: "", dudas: "" };

function armarHistorial(turnos: Turno[]): MensajeChat[] {
  // Solo se mandan las fotos de los últimos mensajes del cliente (costo y contexto).
  const conFotos = new Set(
    turnos
      .map((t, i) => (t.de === "cliente" && t.imagenes?.length ? i : -1))
      .filter((i) => i >= 0)
      .slice(-2),
  );
  const salida: { role: "user" | "assistant"; partes: Parte[] }[] = [];
  turnos.forEach((t, i) => {
    const role = t.de === "cliente" ? "user" : "assistant";
    const partes: Parte[] = [];
    const prefijo = t.de === "equipo" ? "[Escribió una asesora del equipo] " : "";
    const texto = [
      t.texto?.trim(),
      t.imagenes?.length ? (t.de === "cliente" ? "[El cliente envió una foto]" : "[Se envió una foto]") : null,
      ...(t.otros ?? []).map((o) => `[${t.de === "cliente" ? "El cliente envió" : "Se envió"} un ${o}${t.de === "cliente" ? " que no puedes ver ni escuchar" : ""}]`),
    ]
      .filter(Boolean)
      .join(" ");
    if (texto) partes.push({ type: "text", text: prefijo + texto });
    if (conFotos.has(i)) for (const url of (t.imagenes ?? []).slice(0, 2)) partes.push({ type: "image_url", image_url: { url } });
    if (!partes.length) return;
    const ultimo = salida[salida.length - 1];
    if (ultimo?.role === role) ultimo.partes.push(...partes);
    else salida.push({ role, partes });
  });
  // El modelo espera que la conversación empiece y termine con el cliente.
  while (salida[0]?.role === "assistant") salida.shift();
  return salida.map((m) =>
    m.role === "assistant"
      ? { role: "assistant" as const, content: m.partes.map((p) => (p.type === "text" ? p.text : "")).join("\n") }
      : { role: "user" as const, content: m.partes.every((p) => p.type === "text") ? m.partes.map((p) => (p as { text: string }).text).join("\n") : m.partes },
  );
}

const leerArgs = (s: string): Record<string, unknown> => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

export async function pensar(p: {
  turnos: Turno[];
  canal: Plataforma;
  nombre: string | null;
  etapa: string;
  conocimiento?: string;
  lecciones?: Leccion[];
  ahora?: Date;
}): Promise<Decision> {
  const [conocimiento, lecciones] = await Promise.all([
    p.conocimiento ?? leerConocimiento(),
    p.lecciones ?? leerLecciones(),
  ]);
  const catalogo = await productosActivos();
  const porId = new Map(catalogo.map((x) => [x.external_id, x]));
  const messages: MensajeChat[] = [
    {
      role: "system",
      content: instrucciones({
        canal: CANAL[p.canal],
        nombre: p.nombre,
        etapa: p.etapa,
        conocimiento,
        lecciones,
        ahora: p.ahora ?? new Date(),
      }),
    },
    ...armarHistorial(p.turnos),
  ];
  if (messages.length < 2) throw new Error("No hay mensajes del cliente para responder");

  let costo = 0;
  const busquedas: string[] = [];
  for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
    // En la última vuelta ya no se ofrece buscar: tiene que responder.
    const tools = vuelta === MAX_VUELTAS ? HERRAMIENTAS.filter((h) => h.function.name === "responder") : HERRAMIENTAS;
    const r = await chatConHerramientas({ model: MODELO, respaldo: RESPALDO, messages, tools });
    costo += r.costo ?? 0;
    const final = r.llamadas.find((l) => l.function.name === "responder");
    if (final) {
      const a = leerArgs(final.function.arguments);
      const ids = Array.isArray(a.productos) ? (a.productos as unknown[]).map(String) : [];
      const resumen = { ...RESUMEN_VACIO, ...(typeof a.resumen === "object" && a.resumen ? (a.resumen as Partial<Resumen>) : {}) };
      const texto = String(a.texto ?? "").trim();
      if (!texto) throw new Error("La IA respondió sin texto");
      return {
        texto: texto.slice(0, 1000),
        productos: [...new Set(ids)].map((id) => porId.get(id)).filter((x): x is Producto => Boolean(x?.image_url)).slice(0, 4),
        pasar: a.pasar_a_vendedora === true,
        motivo: String(a.motivo ?? "").slice(0, 300),
        resumen,
        costo,
        busquedas,
      };
    }
    const busca = r.llamadas.filter((l) => l.function.name === "buscar_catalogo");
    if (!busca.length) {
      // Respondió con texto suelto en vez de usar la herramienta: se le recuerda.
      messages.push({ role: "assistant", content: r.texto ?? "" });
      messages.push({ role: "user", content: "[Sistema] Usa la herramienta responder para contestar al cliente." });
      continue;
    }
    messages.push({ role: "assistant", content: r.texto ?? null, tool_calls: busca });
    for (const l of busca) {
      const a = leerArgs(l.function.arguments);
      const palabras = Array.isArray(a.palabras) ? (a.palabras as unknown[]).map(String).slice(0, 6) : [];
      const categoria = typeof a.categoria === "string" ? a.categoria : "todas";
      const { total, resultados } = buscarProductos(catalogo, { categoria, palabras });
      busquedas.push(`${categoria}: ${palabras.join(" ") || "(nuevos)"} → ${total}`);
      messages.push({
        role: "tool",
        tool_call_id: l.id,
        content: JSON.stringify({
          encontrados: total,
          productos: resultados.map((x) => ({ id: x.external_id, nombre: x.name, categoria: x.category, detalles: x.description })),
        }),
      });
    }
  }
  throw new Error("La IA no llegó a una respuesta");
}

async function leerConocimiento(): Promise<string> {
  const { data } = await createAdminClient().from("business_knowledge").select("title, content").order("sort_order");
  return (data ?? []).map((k) => `- ${k.title}: ${k.content}`).join("\n");
}

// ---------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------
export async function leerAjustesIA(): Promise<{ modo: ModoIA; contactosPrueba: string[] }> {
  const { data } = await createAdminClient().from("app_settings").select("key, value").in("key", ["ai_modo", "ai_contactos_prueba"]);
  const v = new Map((data ?? []).map((r) => [r.key, r.value]));
  const modo = v.get("ai_modo");
  const prueba = v.get("ai_contactos_prueba");
  return {
    modo: modo === "pruebas" || modo === "encendida" ? modo : "apagada",
    contactosPrueba: Array.isArray(prueba) ? prueba.map(String) : [],
  };
}

// ---------------------------------------------------------------------
// Responder: lo llama el webhook con cada mensaje directo entrante
// ---------------------------------------------------------------------
type Conv = {
  id: string;
  kind: "dm" | "comment";
  ai_mode: "on" | "off" | "handoff";
  external_conversation_id: string;
  contacto: { id: string; name: string | null; stage: string; ai_enabled: boolean };
  canal: { platform: Plataforma; zernio_account_id: string };
};

export async function responderConIA(messageId: string, opciones: { esperaMs?: number } = {}): Promise<string> {
  const db = createAdminClient();
  const { data: msg } = await db
    .from("messages")
    .select("id, conversation_id, direction, created_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.direction !== "inbound") return "no es un mensaje entrante";
  if (Date.now() - new Date(msg.created_at).getTime() > EDAD_MAXIMA_MS) return "mensaje viejo";

  const ajustes = await leerAjustesIA();
  if (ajustes.modo === "apagada") return "IA apagada";

  const cargarConv = async () =>
    (
      await db
        .from("conversations")
        .select(
          "id, kind, ai_mode, external_conversation_id, " +
            "contacto:contacts(id, name, stage, ai_enabled), canal:channel_accounts(platform, zernio_account_id)",
        )
        .eq("id", msg.conversation_id)
        .single()
        .returns<Conv>()
    ).data;
  let conv = await cargarConv();
  if (!conv || conv.kind !== "dm") return "no es mensaje directo";
  if (ajustes.modo === "pruebas" && !ajustes.contactosPrueba.includes(conv.contacto.id)) return "modo pruebas: contacto no incluido";

  // Un registro por mensaje: si el webhook llega dos veces, la segunda no hace nada.
  const { data: run, error: eRun } = await db
    .from("ai_runs")
    .insert({ conversation_id: conv.id, trigger_message_id: msg.id })
    .select("id")
    .single();
  if (eRun || !run) return "ya procesado";
  const terminar = async (status: "respondio" | "traspaso" | "omitido" | "error", detail: string, costo?: number) => {
    await db
      .from("ai_runs")
      .update({ status, detail: detail.slice(0, 1000), cost_usd: costo ?? null, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return `${status}: ${detail}`;
  };

  let d: Decision | null = null;
  try {
    // Esperar por si el cliente sigue escribiendo; responde solo el último mensaje.
    await new Promise((r) => setTimeout(r, opciones.esperaMs ?? ESPERA_MS));
    const { data: ultimo } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (ultimo?.id !== msg.id) return terminar("omitido", "llegó otro mensaje del cliente");

    conv = (await cargarConv()) ?? conv;
    if (conv.ai_mode !== "on") return terminar("omitido", conv.ai_mode === "handoff" ? "ya pasó a vendedora" : "IA apagada en esta conversación");
    if (!conv.contacto.ai_enabled) return terminar("omitido", "IA apagada para este contacto");
    if (!ETAPAS_IA.includes(conv.contacto.stage)) return terminar("omitido", `etapa ${conv.contacto.stage}: atiende el equipo`);

    // Últimos mensajes (24 h para saber si una persona está atendiendo).
    const { data: recientes } = await db
      .from("messages")
      .select("id, direction, sender_type, body, created_at, attachments(type, storage_path, external_url, transcript)")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const hist = (recientes ?? []).reverse();
    const hace24h = Date.now() - 24 * 3600_000;
    const persona = hist.find((m, i) => {
      if (m.sender_type !== "agent" || new Date(m.created_at).getTime() < hace24h) return false;
      const previo = hist[i - 1];
      const automatico =
        previo?.direction === "inbound" && new Date(m.created_at).getTime() - new Date(previo.created_at).getTime() < AUTOMATICO_MS;
      return !automatico;
    });
    if (persona) return terminar("omitido", "una persona del equipo escribió en las últimas 24 h");

    const mensajesIA = hist.filter((m) => m.sender_type === "ai" && new Date(m.created_at).getTime() >= hace24h).length;
    if (mensajesIA >= MAX_MENSAJES_IA_DIA) {
      await traspasar(conv, "Conversación larga con la IA: mejor que siga una persona.", RESUMEN_VACIO);
      return terminar("traspaso", "límite de mensajes de la IA por día");
    }

    // Fotos del cliente con enlace temporal para que el modelo las vea.
    const rutas = hist.flatMap((m) => (m.direction === "inbound" ? m.attachments : []).filter((a) => a.type === "image" && a.storage_path).map((a) => a.storage_path!));
    const firmadas = new Map<string, string>();
    if (rutas.length) {
      const { data: urls } = await db.storage.from("attachments").createSignedUrls(rutas.slice(-4), 10 * 60);
      for (const u of urls ?? []) if (u.path && u.signedUrl) firmadas.set(u.path, u.signedUrl);
    }
    const turnos: Turno[] = hist.map((m) => ({
      de: m.direction === "inbound" ? "cliente" : m.sender_type === "ai" ? "ia" : "equipo",
      // Las notas de voz transcritas se leen como texto.
      texto:
        [m.body, ...m.attachments.filter((a) => a.transcript).map((a) => `(nota de voz) ${a.transcript}`)].filter(Boolean).join("\n") ||
        null,
      imagenes: m.attachments
        .filter((a) => a.type === "image")
        .map((a) => (a.storage_path ? firmadas.get(a.storage_path) : m.direction === "outbound" ? a.external_url : null))
        .filter((u): u is string => Boolean(u)),
      otros: m.attachments
        .filter((a) => a.type !== "image" && !a.transcript)
        .map((a) => (a.type === "audio" ? "audio" : a.type === "video" ? "video" : "archivo")),
    }));

    d = await pensar({ turnos, canal: conv.canal.platform, nombre: conv.contacto.name, etapa: conv.contacto.stage });

    // Antes de enviar: si mientras pensaba llegó otro mensaje o alguien tomó la conversación, no se envía.
    const { data: ultimo2 } = await db
      .from("messages")
      .select("id, direction, sender_type")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const conv2 = await cargarConv();
    if (ultimo2?.id !== msg.id || conv2?.ai_mode !== "on") return terminar("omitido", "la conversación cambió mientras la IA pensaba", d.costo);

    await enviarRespuesta(conv, run.id, d);
    if (d.pasar) {
      await traspasar(conv, d.motivo || "La IA pasó la conversación a una persona.", d.resumen);
      return terminar("traspaso", `${d.motivo} · ${d.texto}`, d.costo);
    }
    if (conv.contacto.stage !== "advising") await db.from("contacts").update({ stage: "advising" }).eq("id", conv.contacto.id);
    return terminar("respondio", `${d.texto}${d.productos.length ? ` · ${d.productos.length} fotos` : ""} · ${d.busquedas.join("; ")}`, d.costo);
  } catch (e) {
    console.error("asesora", messageId, e);
    const error = e instanceof Error ? e.message : String(e);
    return terminar("error", d ? `${error} · iba a responder: ${d.texto}` : error, d?.costo);
  }
}

async function enviarRespuesta(conv: Conv, runId: string, d: Decision) {
  const db = createAdminClient();
  const accountId = conv.canal.zernio_account_id;
  let n = 0;
  const enviar = async (texto: string | null, imagen?: string) => {
    const r = await sendInboxMessage(conv.external_conversation_id, {
      accountId,
      message: texto ?? undefined,
      attachmentUrl: imagen,
      attachmentType: imagen ? "image" : undefined,
      idempotencyKey: `ia-${runId}-${n++}`,
    });
    // Si el webhook ya trajo este mismo mensaje, queda marcado como de la IA.
    const { data } = await db
      .from("messages")
      .upsert(
        {
          conversation_id: conv.id,
          direction: "outbound",
          sender_type: "ai",
          sender_profile_id: null,
          body: texto,
          external_message_id: r.messageId,
          delivery_status: "sent",
        },
        { onConflict: "external_message_id" },
      )
      .select("id")
      .single();
    if (imagen && data?.id) {
      const { count } = await db.from("attachments").select("id", { count: "exact", head: true }).eq("message_id", data.id);
      if (!count) await db.from("attachments").insert({ message_id: data.id, type: "image", mime_type: "image/jpeg", external_url: imagen });
    }
  };

  await enviar(d.texto);
  if (!d.productos.length) return;
  if (conv.canal.platform === "whatsapp") {
    // WhatsApp: foto con el nombre y el enlace al pie.
    for (const p of d.productos) await enviar(`${p.name}\n${p.product_url}`, p.image_url!);
  } else {
    // Messenger e Instagram no llevan texto en la foto: fotos y después los enlaces.
    for (const p of d.productos) await enviar(null, p.image_url!);
    await enviar(d.productos.map((p) => `• ${p.name}\n${p.product_url}`).join("\n"));
  }
}

async function traspasar(conv: Conv, motivo: string, resumen: Resumen) {
  const db = createAdminClient();
  await db.from("ai_handoffs").insert({ conversation_id: conv.id, reason: motivo, summary: resumen });
  await db.from("conversations").update({ ai_mode: "handoff" }).eq("id", conv.id);
  await avisarTraspaso(conv.id, motivo).catch((e) => console.error("aviso traspaso", e));
  if (ORDEN.indexOf(conv.contacto.stage) < ORDEN.indexOf("ready_for_seller")) {
    await db.from("stage_events").insert({
      contact_id: conv.contacto.id,
      to_stage: "ready_for_seller",
      source: "ai",
      note: `Pasó a vendedora: ${motivo}`,
    });
    // Un traspaso no es una detección dudosa: no queda "por confirmar".
    await db.from("contacts").update({ stage_pending_review: false }).eq("id", conv.contacto.id);
  }
}
