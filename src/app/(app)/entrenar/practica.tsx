"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { practicar, type RespuestaPractica } from "./acciones";
import { BotonCorregir } from "./corregir-form";

type Linea =
  | { de: "cliente"; texto: string }
  | { de: "ia"; texto: string; r: RespuestaPractica };

const EJEMPLOS = [
  "Hola, busco algo para el cumpleaños de mi hija",
  "¿Hacen envíos a Cartago?",
  "Precio de los jeans negros?",
  "¿Venden al por mayor?",
];

/** Chat de práctica: escribes como cliente y la IA responde como en WhatsApp, sin enviar nada. */
export function Practica() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState("");
  const [propuestas, setPropuestas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lineas, pensando]);

  const enviar = (mensaje: string) => {
    const t = mensaje.trim();
    if (!t || pensando) return;
    const nuevas: Linea[] = [...lineas, { de: "cliente", texto: t }];
    setLineas(nuevas);
    setTexto("");
    setError(null);
    iniciar(async () => {
      const r = await practicar(
        // La IA necesita saber qué fotos mandó para entender "me gusta la segunda".
        nuevas.map((l) => ({
          de: l.de,
          texto:
            l.de === "ia" && l.r.productos?.length
              ? `${l.texto}\n[Fotos enviadas: ${l.r.productos.map((p, n) => `${n + 1}) ${p.nombre}`).join("; ")}]`
              : l.texto,
        })),
        propuestas,
      );
      if (!r.ok || !r.texto) {
        setError(r.error ?? "La IA no respondió.");
        return;
      }
      setLineas((ls) => [...ls, { de: "ia", texto: r.texto!, r }]);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Escríbele como si fueras un cliente. Responde igual que en WhatsApp, pero no le llega nada a nadie. Si una respuesta no te gusta, toca{" "}
        <b>Corregir</b>.
      </p>

      <div className="flex min-h-[320px] flex-col gap-2 rounded-xl border border-border bg-background p-3">
        {!lineas.length && (
          <div className="m-auto flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted">Prueba con algo como:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => enviar(e)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {lineas.map((l, i) =>
          l.de === "cliente" ? (
            <div key={i} className="flex justify-start">
              <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-[15px] whitespace-pre-wrap">
                {l.texto}
              </p>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-end gap-1">
              <p className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/25 bg-accent/10 px-3 py-2 text-[15px] whitespace-pre-wrap">
                {l.texto}
              </p>
              {l.r.productos?.map((p) => (
                <a
                  key={p.enlace ?? p.nombre}
                  href={p.enlace ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex max-w-[85%] items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 p-1.5 pr-3 text-sm hover:border-accent"
                >
                  {p.imagen && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen} alt="" className="size-14 rounded-lg object-cover" loading="lazy" />
                  )}
                  <span>{p.nombre}</span>
                </a>
              ))}
              {l.r.pasa && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  → Aquí pasaría a una vendedora: {l.r.motivo}
                </p>
              )}
              <BotonCorregir situacion={ultimoCliente(lineas, i)} original={l.texto} />
            </div>
          ),
        )}
        {pensando && <p className="self-end text-sm text-muted">La IA está escribiendo…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div ref={fin} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex gap-2"
      >
        <label htmlFor="practica-texto" className="sr-only">
          Mensaje como cliente
        </label>
        <input
          id="practica-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={1500}
          placeholder="Escribe como cliente…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
        />
        <button
          disabled={pensando || !texto.trim()}
          className="h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Enviar
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={propuestas} onChange={(e) => setPropuestas(e.target.checked)} className="accent-[var(--color-accent)]" />
          Probar también las lecciones que faltan por aprobar
        </label>
        {lineas.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setLineas([]);
              setError(null);
            }}
            className="text-sm font-medium text-accent"
          >
            Empezar otra conversación
          </button>
        )}
      </div>
    </div>
  );
}

function ultimoCliente(lineas: Linea[], hasta: number) {
  for (let i = hasta - 1; i >= 0; i--) if (lineas[i].de === "cliente") return lineas[i].texto;
  return "";
}
