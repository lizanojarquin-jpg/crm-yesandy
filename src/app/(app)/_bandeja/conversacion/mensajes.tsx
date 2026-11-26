import { Fragment } from "react";
import type { Mensaje } from "@/lib/inbox/queries";
import { claveDia, encabezadoDia, hora } from "@/lib/formato";
import { textoEtapa } from "@/lib/inbox/etiquetas";
import { BotonCorregir } from "../../entrenar/corregir-form";

export function Mensajes({ mensajes, nombres, esAdmin }: { mensajes: Mensaje[]; nombres: Map<string, string>; esAdmin: boolean }) {
  if (!mensajes.length) {
    return <p className="py-10 text-center text-sm text-muted">Todavía no hay mensajes en esta conversación.</p>;
  }
  return mensajes.map((m, i) => {
    const nuevoDia = i === 0 || claveDia(mensajes[i - 1].created_at) !== claveDia(m.created_at);
    return (
      <Fragment key={m.id}>
        {nuevoDia && (
          <div className="my-3 flex justify-center">
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted first-letter:uppercase">
              {encabezadoDia(m.created_at)}
            </span>
          </div>
        )}
        <Burbuja m={m} nombres={nombres} situacion={m.sender_type === "ai" ? ultimoDelCliente(mensajes, i) : ""} corregir={esAdmin} />
      </Fragment>
    );
  });
}

/** Lo último que escribió el cliente antes de la respuesta de la IA (para la corrección). */
function ultimoDelCliente(mensajes: Mensaje[], hasta: number) {
  const partes: string[] = [];
  for (let i = hasta - 1; i >= 0 && partes.length < 3; i--) {
    const m = mensajes[i];
    if (m.direction !== "inbound") {
      if (partes.length) break;
      continue;
    }
    partes.unshift(m.body?.trim() || (m.adjuntos.length ? "[foto]" : ""));
  }
  return partes.filter(Boolean).join(" / ");
}

function autor(m: Mensaje, nombres: Map<string, string>) {
  if (m.direction === "inbound") return null;
  if (m.sender_type === "ai") return "Asesora IA";
  if (m.sender_profile_id) return nombres.get(m.sender_profile_id) ?? "Equipo";
  return "Desde la app";
}

function Burbuja({
  m,
  nombres,
  situacion,
  corregir,
}: {
  m: Mensaje;
  nombres: Map<string, string>;
  situacion: string;
  corregir: boolean;
}) {
  const sale = m.direction === "outbound";
  const quien = autor(m, nombres);
  // La ubicación llega con el texto "📍 Location": se muestra la tarjeta en su lugar.
  const texto = m.ubicacion && /^📍\s*location$/i.test(m.body?.trim() ?? "") ? null : m.body;
  return (
    <div id={`m-${m.id}`} className={`flex scroll-mt-24 flex-col ${sale ? "items-end" : "items-start"} [&:target>div:first-child]:ring-2 [&:target>div:first-child]:ring-amber-400`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-[0_1px_0_rgba(0,0,0,0.04)] transition sm:max-w-[70%] ${
          sale
            ? m.sender_type === "ai"
              ? "rounded-br-md border border-accent/25 bg-accent/10 text-foreground"
              : "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md border border-border bg-surface text-foreground"
        }`}
      >
        {m.anuncio && <AnuncioOrigen a={m.anuncio} />}
        {m.cita && <CitaMensaje c={m.cita} />}
        {m.ubicacion && <Ubicacion u={m.ubicacion} />}
        {m.adjuntos.map((a) => (
          <Adjunto key={a.id} a={a} />
        ))}
        {texto && <p className="break-words whitespace-pre-wrap">{texto}</p>}
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            sale && m.sender_type !== "ai" ? "text-accent-foreground/75" : "text-muted"
          }`}
        >
          {quien && <span>{quien} ·</span>}
          <span>{hora(m.created_at)}</span>
          {sale && <Estado s={m.delivery_status} />}
        </p>
      </div>
      {m.evidencia && (
        <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          🔎 La IA detectó: {textoEtapa(m.evidencia.to_stage)}
          {m.evidencia.confirmada ? " · confirmado" : " · por confirmar"}
        </p>
      )}
      {corregir && m.sender_type === "ai" && m.body && !m.adjuntos.length && <BotonCorregir situacion={situacion} original={m.body} messageId={m.id} />}
      {m.delivery_status === "failed" && (
        <p className="mt-0.5 text-xs text-danger">No se entregó{m.error_message ? `: ${m.error_message}` : ""}</p>
      )}
    </div>
  );
}

const TIPO_CITADO: Record<string, string> = { image: "📷 Foto", sticker: "Sticker", audio: "🎤 Audio", video: "🎬 Video", file: "📎 Archivo" };

/** El mensaje al que responde (como el "responder" de WhatsApp). Toca para ir a él. */
function CitaMensaje({ c }: { c: NonNullable<Mensaje["cita"]> }) {
  const quien = c.deCliente === null ? "Mensaje anterior" : c.deCliente ? "Cliente" : "Almacén Yesandy";
  const texto = c.texto ?? (c.tipo ? TIPO_CITADO[c.tipo] ?? "Adjunto" : c.id ? "Mensaje" : "Un mensaje que no está en el CRM");
  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold opacity-80">↩ {quien}</span>
        <span className="line-clamp-3 block text-[13px] break-words whitespace-pre-wrap opacity-90">{texto}</span>
      </span>
      {c.foto && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Supabase
        <img src={c.foto} alt="Foto citada" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" />
      )}
    </>
  );
  const clase = "-mx-1 mb-1.5 flex items-center gap-2 rounded-lg border-l-4 border-current/40 bg-black/5 px-2 py-1.5 dark:bg-white/10";
  return c.id ? (
    <a href={`#m-${c.id}`} className={`${clase} hover:bg-black/10 dark:hover:bg-white/15`} aria-label={`Responde a: ${texto}`}>
      {contenido}
    </a>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/** El anuncio que el cliente tocó para escribir (como el recuadro "Viste este anuncio" de WhatsApp). */
function AnuncioOrigen({ a }: { a: NonNullable<Mensaje["anuncio"]> }) {
  const enlace = a.enlace ?? a.video;
  return (
    <div className="-mx-1 mb-1.5 w-64 max-w-[calc(100vw-5rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground">
      {a.imagen && (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura del anuncio (Supabase o Facebook)
        <img src={a.imagen} alt={a.titulo ? `Anuncio: ${a.titulo}` : "Imagen del anuncio"} loading="lazy" className="max-h-56 w-full object-cover" />
      )}
      <div className="flex flex-col gap-0.5 p-2">
        <span className="text-[11px] font-semibold tracking-wide text-accent uppercase">📣 Llegó por un anuncio</span>
        {a.titulo && <span className="text-sm font-semibold break-words">{a.titulo}</span>}
        {a.texto && (
          // Tocar el texto lo muestra completo (y otra vez lo recoge).
          <details className="group text-xs text-muted">
            <summary className="line-clamp-3 cursor-pointer list-none break-words whitespace-pre-wrap group-open:line-clamp-none [&::-webkit-details-marker]:hidden">
              {a.texto}
            </summary>
          </details>
        )}
        {enlace && (
          <a href={enlace} target="_blank" rel="noreferrer" className="mt-1 text-[13px] font-medium text-accent underline">
            Ver anuncio
          </a>
        )}
      </div>
    </div>
  );
}

/** Ubicación que mandó el cliente: mapa y botones para abrirla en Google Maps o Waze. */
function Ubicacion({ u }: { u: NonNullable<Mensaje["ubicacion"]> }) {
  const ll = `${u.latitude},${u.longitude}`;
  const d = 0.004;
  const bbox = [u.longitude - d, u.latitude - d * 0.6, u.longitude + d, u.latitude + d * 0.6].join(",");
  const google = `https://www.google.com/maps/search/?api=1&query=${ll}`;
  const boton = "inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-accent px-2 text-[13px] font-medium text-accent-foreground";
  return (
    <div className="-mx-1 mb-1 w-72 max-w-[calc(100vw-5rem)] overflow-hidden rounded-xl border border-border bg-background text-foreground">
      {/* Tocar el mapa abre Google Maps (el mapa en sí no se mueve dentro del chat). */}
      <a href={google} target="_blank" rel="noreferrer" aria-label="Abrir la ubicación en Google Maps" className="relative block">
        <iframe
          title="Mapa de la ubicación del cliente"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${ll}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin"
          tabIndex={-1}
          className="pointer-events-none block h-48 w-full border-0"
        />
      </a>
      <div className="p-2">
        <p className="text-sm font-medium">📍 {u.name || "Ubicación del cliente"}</p>
        {u.address && <p className="text-xs text-muted">{u.address}</p>}
        <div className="mt-2 flex gap-2">
          <a href={google} target="_blank" rel="noreferrer" className={boton}>
            Google Maps
          </a>
          <a href={`https://waze.com/ul?ll=${ll}&navigate=yes`} target="_blank" rel="noreferrer" className={boton}>
            Waze
          </a>
        </div>
      </div>
    </div>
  );
}

function Estado({ s }: { s: Mensaje["delivery_status"] }) {
  if (s === "read") return <span aria-label="Leído" className="font-semibold">✓✓</span>;
  if (s === "delivered") return <span aria-label="Entregado">✓✓</span>;
  if (s === "sent") return <span aria-label="Enviado">✓</span>;
  if (s === "pending") return <span aria-label="Enviando">…</span>;
  return null;
}

function Adjunto({ a }: { a: Mensaje["adjuntos"][number] }) {
  if (!a.url) {
    return <p className="mb-1 text-sm opacity-80">📎 Adjunto ({a.type === "image" ? "imagen" : a.type}) no disponible</p>;
  }
  if (a.type === "image" || a.type === "sticker") {
    const tipo = a.detected_kind === "payment_receipt" ? "Comprobante de pago" : a.detected_kind === "shipping_guide" ? "Guía de envío" : null;
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="relative -mx-1 mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Supabase */}
        <img src={a.url} alt={tipo ?? "Imagen enviada en el chat"} loading="lazy" className="max-h-80 w-auto rounded-xl" />
        {tipo && (
          <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">{tipo}</span>
        )}
      </a>
    );
  }
  if (a.type === "video") {
    return <video src={a.url} controls preload="metadata" className="mb-1 max-h-80 rounded-xl" />;
  }
  if (a.type === "audio") {
    return (
      <div className="mb-1 flex flex-col gap-1">
        <audio controls preload="metadata" className="w-64 max-w-full">
          {/* WhatsApp manda OGG/Opus; se declara el tipo para que el navegador elija bien. */}
          <source src={a.url} type={a.mime_type?.split(";")[0] || "audio/ogg"} />
        </audio>
        <a href={a.url} download className="text-[11px] underline opacity-70">
          Descargar audio
        </a>
        {a.transcript && (
          <p className="max-w-64 text-sm italic opacity-90">
            <span aria-hidden>🎤 </span>
            {a.transcript}
          </p>
        )}
      </div>
    );
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="mb-1 block text-sm underline">
      📎 Abrir archivo
    </a>
  );
}
