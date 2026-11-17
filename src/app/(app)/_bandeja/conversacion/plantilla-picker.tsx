"use client";

import { useActionState, useId, useState } from "react";
import { enviarPlantilla, type Estado } from "../acciones";

export type PlantillaOpcion = { name: string; language: string; category: string; texto: string; variables: number };

const legible = (n: string) => n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Fuera de las 24 h de WhatsApp: elegir una plantilla aprobada, llenar sus datos y enviarla. */
export function PlantillaPicker({
  conversationId,
  plantillas,
  primerNombre,
}: {
  conversationId: string;
  plantillas: PlantillaOpcion[];
  primerNombre: string;
}) {
  const id = useId();
  const [elegida, setElegida] = useState<PlantillaOpcion | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(async (prev, fd) => {
    const r = await enviarPlantilla(conversationId, prev, fd);
    if (r?.ok) {
      setElegida(null);
      setIdem(crypto.randomUUID());
    }
    return r;
  }, null);

  if (!plantillas.length) {
    return (
      <p className="mt-2 text-xs text-muted">
        Todavía no hay plantillas aprobadas. El administrador las ve en Configuración → Plantillas de WhatsApp.
      </p>
    );
  }

  const elegir = (p: PlantillaOpcion | null) => {
    setElegida(p);
    // El primer dato suele ser el nombre del cliente.
    setValores(p ? Array.from({ length: p.variables }, (_, i) => (i === 0 ? primerNombre : "")) : []);
  };

  const vista = elegida ? elegida.texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `[dato ${n}]`) : "";

  return (
    <form action={accion} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="idem" value={idem} />
      <label htmlFor={`${id}-p`} className="text-sm font-medium">
        Enviar una plantilla
      </label>
      <select
        id={`${id}-p`}
        value={elegida ? `${elegida.name}|${elegida.language}` : ""}
        onChange={(e) => elegir(plantillas.find((p) => `${p.name}|${p.language}` === e.target.value) ?? null)}
        className="h-11 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
      >
        <option value="">Elige una plantilla…</option>
        {plantillas.map((p) => (
          <option key={`${p.name}|${p.language}`} value={`${p.name}|${p.language}`}>
            {legible(p.name)}
          </option>
        ))}
      </select>

      {elegida && (
        <>
          <input type="hidden" name="plantilla" value={elegida.name} />
          <input type="hidden" name="idioma" value={elegida.language} />
          {valores.map((v, i) => (
            <div key={i} className="flex flex-col gap-1">
              <label htmlFor={`${id}-v${i}`} className="text-xs font-medium text-muted">
                Dato {i + 1}
                {i === 0 ? " (nombre del cliente)" : ""}
              </label>
              <input
                id={`${id}-v${i}`}
                name="variable"
                value={v}
                required
                maxLength={500}
                onChange={(e) => setValores((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-10 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
              />
            </div>
          ))}
          <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm whitespace-pre-wrap">{vista}</p>
          <p className="text-xs text-muted">Meta cobra cada plantilla entregada (unos centavos de dólar).</p>
          <button
            disabled={pendiente}
            className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {pendiente ? "Enviando…" : "Enviar plantilla"}
          </button>
        </>
      )}
      {estado && <p className={`text-sm ${estado.ok ? "text-muted" : "text-danger"}`}>{estado.mensaje}</p>}
    </form>
  );
}
