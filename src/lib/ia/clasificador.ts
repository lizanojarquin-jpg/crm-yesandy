import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Etapa } from "@/lib/inbox/etiquetas";
import { completarJSON, type Parte } from "./openrouter";
import { avisarPago } from "@/lib/push";

// ---------------------------------------------------------------------
// Detecta en qué etapa va la venta a partir de cada mensaje (texto e imágenes).
// La etapa queda "por confirmar" hasta que una persona la revise.
// ---------------------------------------------------------------------

const MODELO = () => process.env.OPENROUTER_MODEL_CLASIFICADOR || "google/gemini-2.5-flash-lite";
const CONFIANZA_MINIMA = 0.7;

const ORDEN: Etapa[] = ["new", "advising", "ready_for_seller", "order_confirmed", "payment_received", "shipped", "delivered"];
const DETECTABLES = ["order_confirmed", "payment_received", "shipped", "delivered"] as const;
const ADJUNTOS = ["payment_receipt", "shipping_guide", "product_photo", "other"] as const;

/** Palabras que justifican revisar un texto. Sin ninguna, no se gasta en la IA. ("cancelé" en Costa Rica = pagué) */
const PISTAS =
  /pedido|prepar|apart|separ|sinpe|transfer|dep[oó]sit|comprobante|pagu|pag[oó]|pagad|cancel[eé]|camino|envi[aéoó]|enví|despach|gu[ií]a|encomienda|correos|mensajer|entreg|lleg[oó]|recib/i;

export type Clasificacion = {
  etapa: (typeof DETECTABLES)[number] | "ninguna";
  adjunto: (typeof ADJUNTOS)[number] | "ninguno";
  confianza: number;
  motivo: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["etapa", "adjunto", "confianza", "motivo"],
  properties: {
    etapa: { type: "string", enum: ["ninguna", ...DETECTABLES] },
    adjunto: { type: "string", enum: ["ninguno", ...ADJUNTOS] },
    confianza: { type: "number", minimum: 0, maximum: 1 },
    motivo: { type: "string", maxLength: 200 },
  },
};

const SISTEMA = `Clasificas mensajes de chat de Almacén Yesandy, una tienda de ropa, artículos de hogar y fragancias en Costa Rica que vende por WhatsApp, Messenger e Instagram.
Recibes la etapa actual del cliente, los mensajes anteriores y UN mensaje nuevo (de la TIENDA o del CLIENTE, a veces con imagen). Decides si ese mensaje nuevo prueba que la venta llegó a una de estas etapas:

- order_confirmed: la tienda confirma que prepara, aparta o separa el pedido ("voy a preparar tu pedido", "ya se lo aparto", "le separo las prendas"), o la tienda acepta un pedido concreto que el cliente confirmó.
- payment_received: hay prueba de pago: captura o foto de comprobante de SINPE Móvil, transferencia o depósito (BAC, BCR, Banco Nacional, Davivienda, Promerica, Popular, etc.), o el cliente dice claramente que ya pagó, ya canceló o ya hizo el SINPE.
- shipped: el pedido ya salió: "va en camino", "ya se lo envié", "ya lo despaché", foto de guía de Correos de Costa Rica, tiquete o recibo de encomienda (bus o transportista), número de guía.
- delivered: el cliente confirma que recibió el pedido ("ya me llegó", "ya lo recibí").

Responde etapa "ninguna" si es un saludo, una consulta, precios, tallas, fotos de productos, el catálogo, preguntar métodos de pago, la dirección de la tienda, o si no estás seguro. Una foto de ropa o de un producto NO es un comprobante. "Te envío fotos" NO es un envío del pedido.

adjunto: si hay imagen, clasifícala: payment_receipt (comprobante de pago), shipping_guide (guía, tiquete o recibo de envío o encomienda), product_photo (prenda, producto, catálogo, captura de una publicación), other. Sin imagen: "ninguno".
confianza: de 0 a 1.
motivo: una frase corta en español con la evidencia (sin datos bancarios ni números de cuenta).`;

export function avanza(actual: Etapa, nueva: Etapa) {
  if (actual === "lost" || actual === "no_response") return true;
  return ORDEN.indexOf(nueva) > ORDEN.indexOf(actual);
}

/** Llamada a la IA con el contenido ya armado (también la usan las pruebas). */
export function clasificarContenido(p: { actual: Etapa; historial: string; deCliente: boolean; texto: string; imagenes: string[] }) {
  const partes: Parte[] = [
    {
      type: "text",
      text: `Etapa actual: ${p.actual}\n\nMensajes anteriores:\n${p.historial || "(ninguno)"}\n\nMensaje nuevo de ${
        p.deCliente ? "el CLIENTE" : "la TIENDA"
      }: ${p.texto ? `"${p.texto.slice(0, 1500)}"` : "(sin texto)"}${p.imagenes.length ? `\n(${p.imagenes.length} imagen(es) adjunta(s))` : ""}`,
    },
    ...p.imagenes.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
  return completarJSON<Clasificacion>({
    model: MODELO(),
    respaldo: ["google/gemini-2.5-flash"],
    nombre: "clasificacion_etapa",
    schema: SCHEMA,
    messages: [
      { role: "system", content: SISTEMA },
      { role: "user", content: partes },
    ],
  });
}

type Resultado = { estado: "omitido" | "sin_cambio" | "movido"; detalle?: string; clasificacion?: Clasificacion; costo?: number | null };

/**
 * Clasifica un mensaje guardado. Con `soloProbar` no escribe nada (para pruebas).
 */
export async function clasificarMensaje(messageId: string, { soloProbar = false } = {}): Promise<Resultado> {
  const db = createAdminClient();
  const { data: m } = await db
    .from("messages")
    .select(
      "id, body, direction, created_at, conversation_id, attachments(id, type, storage_path), conversations!inner(kind, contact_id, contacts!inner(stage))",
    )
    .eq("id", messageId)
    .maybeSingle()
    .returns<{
      id: string;
      body: string | null;
      direction: "inbound" | "outbound";
      created_at: string;
      conversation_id: string;
      attachments: { id: string; type: string; storage_path: string | null }[];
      conversations: { kind: "dm" | "comment"; contact_id: string; contacts: { stage: Etapa } };
    } | null>();
  if (!m) return { estado: "omitido", detalle: "no existe" };
  if (m.conversations.kind !== "dm") return { estado: "omitido", detalle: "comentario" };

  const imagenes = m.attachments.filter((a) => a.type === "image" && a.storage_path).slice(0, 3);
  const texto = (m.body ?? "").replace(/^📋 /, "").trim();
  if (!imagenes.length && !PISTAS.test(texto)) return { estado: "omitido", detalle: "sin pistas" };

  if (!soloProbar) {
    const { count } = await db.from("stage_events").select("id", { count: "exact", head: true }).eq("evidence_message_id", m.id);
    if (count) return { estado: "omitido", detalle: "ya clasificado" };
  }

  const actual = m.conversations.contacts.stage;
  const { data: previos } = await db
    .from("messages")
    .select("body, direction")
    .eq("conversation_id", m.conversation_id)
    .lt("created_at", m.created_at)
    .order("created_at", { ascending: false })
    .limit(6);
  const historial = (previos ?? [])
    .reverse()
    .map((x) => `${x.direction === "inbound" ? "CLIENTE" : "TIENDA"}: ${(x.body ?? "[adjunto]").slice(0, 300)}`)
    .join("\n");

  const urls: string[] = [];
  for (const img of imagenes) {
    const { data: u } = await db.storage.from("attachments").createSignedUrl(img.storage_path!, 600);
    if (u?.signedUrl) urls.push(u.signedUrl);
  }

  const { datos: c, costo } = await clasificarContenido({
    actual,
    historial,
    deCliente: m.direction === "inbound",
    texto,
    imagenes: urls,
  });

  if (soloProbar) return { estado: "sin_cambio", clasificacion: c, costo };

  // Marca qué es cada imagen (comprobante, guía…).
  if (imagenes.length && c.adjunto !== "ninguno") {
    await db.from("attachments").update({ detected_kind: c.adjunto }).in("id", imagenes.map((i) => i.id));
  }

  if (c.etapa === "ninguna" || c.confianza < CONFIANZA_MINIMA) return { estado: "sin_cambio", clasificacion: c, costo };
  if (!avanza(actual, c.etapa)) return { estado: "sin_cambio", detalle: "no avanza", clasificacion: c, costo };

  // El trigger mueve la etapa del contacto y la deja "por confirmar".
  const { error } = await db.from("stage_events").insert({
    contact_id: m.conversations.contact_id,
    to_stage: c.etapa,
    source: "ai",
    evidence_message_id: m.id,
    note: c.motivo.slice(0, 300),
  });
  if (error) throw error;
  if (c.etapa === "payment_received") {
    await avisarPago(m.conversation_id, c.motivo).catch((e) => console.error("aviso pago", e));
  }
  return { estado: "movido", clasificacion: c, costo };
}
