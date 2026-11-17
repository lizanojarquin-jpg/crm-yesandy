"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { enviar, type Estado } from "../acciones";
import { PlantillaPicker, type PlantillaOpcion } from "./plantilla-picker";

type Props = {
  conversationId: string;
  esComentario: boolean;
  permitePrivado: boolean;
  puede: boolean;
  aviso: string | null;
  /** Solo WhatsApp fuera de las 24 h. */
  plantillas?: PlantillaOpcion[];
  primerNombre?: string;
};

/** Reduce fotos del celular (varios MB) a JPEG de 1600 px antes de enviarlas. */
async function comprimir(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif" || (f.type === "image/jpeg" && f.size < 400_000)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

export function Composer({ conversationId, esComentario, permitePrivado, puede, aviso, plantillas, primerNombre }: Props) {
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<{ archivo: File; vista: string } | null>(null);
  const [privado, setPrivado] = useState(false);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const archivo = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const quitarImagen = () => {
    if (imagen) URL.revokeObjectURL(imagen.vista);
    setImagen(null);
    if (archivo.current) archivo.current.value = "";
  };

  const [estado, accion, pendiente] = useActionState<Estado, FormData>(async (prev, fd) => {
    const r = await enviar(conversationId, prev, fd);
    if (r?.ok) {
      // Se limpia todo y se prepara una llave nueva contra envíos dobles.
      setTexto("");
      quitarImagen();
      setPrivado(false);
      setIdem(crypto.randomUUID());
    }
    return r;
  }, null);

  // La caja crece con el texto hasta 6 líneas.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [texto]);

  if (!puede) {
    return (
      <div className="max-h-[60dvh] overflow-y-auto border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{aviso}</p>
        {plantillas && (
          <PlantillaPicker conversationId={conversationId} plantillas={plantillas} primerNombre={primerNombre ?? ""} />
        )}
      </div>
    );
  }

  async function mandar() {
    if (pendiente || (!texto.trim() && !imagen)) return;
    const fd = new FormData();
    fd.set("mensaje", texto);
    fd.set("idem", idem);
    if (privado) fd.set("privado", "1");
    if (imagen) fd.set("imagen", await comprimir(imagen.archivo));
    startTransition(() => accion(fd));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mandar();
      }}
      className="border-t border-border bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4"
    >
      {aviso && <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">{aviso}</p>}

      {esComentario && (
        <div className="mb-2 flex gap-1.5" role="radiogroup" aria-label="Cómo responder">
          {[
            { v: false, t: "Responder en público" },
            ...(permitePrivado ? [{ v: true, t: "Mensaje privado" }] : []),
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              role="radio"
              aria-checked={privado === o.v}
              onClick={() => setPrivado(o.v)}
              className={`h-8 rounded-full border px-3 text-[13px] font-medium ${
                privado === o.v ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
              }`}
            >
              {o.t}
            </button>
          ))}
        </div>
      )}

      {imagen && (
        <div className="mb-2 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
          <img src={imagen.vista} alt="Imagen por enviar" className="h-20 w-20 rounded-lg object-cover" />
          <button
            type="button"
            onClick={quitarImagen}
            className="text-sm text-muted underline"
          >
            Quitar
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {!esComentario && (
          <>
            <input
              ref={archivo}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (imagen) URL.revokeObjectURL(imagen.vista);
                setImagen(f ? { archivo: f, vista: URL.createObjectURL(f) } : null);
              }}
            />
            <button
              type="button"
              onClick={() => archivo.current?.click()}
              aria-label="Adjuntar imagen"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-4.5-4.5L5 21" />
              </svg>
            </button>
          </>
        )}
        <textarea
          ref={area}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // En computadora Enter envía y Shift+Enter hace salto de línea. En el celular Enter es salto de línea.
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              mandar();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={esComentario ? (privado ? "Mensaje privado al cliente…" : "Respuesta pública…") : "Escribe un mensaje…"}
          aria-label="Mensaje"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pendiente || (!texto.trim() && !imagen)}
          aria-label="Enviar"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition disabled:opacity-40"
        >
          {pendiente ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
            </svg>
          )}
        </button>
      </div>
      {estado && !estado.ok && <p role="alert" className="mt-1.5 text-sm text-danger">{estado.mensaje}</p>}
    </form>
  );
}
