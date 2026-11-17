import { Fragment } from "react";
import type { Mensaje } from "@/lib/inbox/queries";
import { claveDia, encabezadoDia, hora } from "@/lib/formato";

export function Mensajes({ mensajes, nombres }: { mensajes: Mensaje[]; nombres: Map<string, string> }) {
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
        <Burbuja m={m} nombres={nombres} />
      </Fragment>
    );
  });
}

function autor(m: Mensaje, nombres: Map<string, string>) {
  if (m.direction === "inbound") return null;
  if (m.sender_type === "ai") return "Asesora IA";
  if (m.sender_profile_id) return nombres.get(m.sender_profile_id) ?? "Equipo";
  return "Desde la app";
}

function Burbuja({ m, nombres }: { m: Mensaje; nombres: Map<string, string> }) {
  const sale = m.direction === "outbound";
  const quien = autor(m, nombres);
  return (
    <div className={`flex flex-col ${sale ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:max-w-[70%] ${
          sale
            ? m.sender_type === "ai"
              ? "rounded-br-md border border-accent/25 bg-accent/10 text-foreground"
              : "rounded-br-md bg-accent text-accent-foreground"
            : "rounded-bl-md border border-border bg-surface text-foreground"
        }`}
      >
        {m.adjuntos.map((a) => (
          <Adjunto key={a.id} a={a} />
        ))}
        {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
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
      {m.delivery_status === "failed" && (
        <p className="mt-0.5 text-xs text-danger">No se entregó{m.error_message ? `: ${m.error_message}` : ""}</p>
      )}
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
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="-mx-1 mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Supabase */}
        <img src={a.url} alt="Imagen enviada en el chat" loading="lazy" className="max-h-80 w-auto rounded-xl" />
      </a>
    );
  }
  if (a.type === "video") {
    return <video src={a.url} controls preload="metadata" className="mb-1 max-h-80 rounded-xl" />;
  }
  if (a.type === "audio") {
    return <audio src={a.url} controls preload="metadata" className="mb-1 w-64 max-w-full" />;
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="mb-1 block text-sm underline">
      📎 Abrir archivo
    </a>
  );
}
