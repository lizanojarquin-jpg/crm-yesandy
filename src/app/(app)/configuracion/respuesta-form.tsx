"use client";

import { useActionState, useId } from "react";
import { guardarRespuesta, type EstadoRespuesta } from "./respuestas-actions";

const caja = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export function RespuestaForm({ id, titulo, texto }: { id?: string; titulo?: string; texto?: string }) {
  const uid = useId();
  const [estado, accion, pendiente] = useActionState<EstadoRespuesta, FormData>(guardarRespuesta.bind(null, id ?? null), null);
  return (
    <form action={accion} key={!id && estado?.ok ? estado.n : "f"} className="flex flex-col gap-2">
      {!id && <p className="text-sm font-medium">Nueva respuesta rápida</p>}
      <label htmlFor={`${uid}-t`} className="sr-only">
        Nombre
      </label>
      <input id={`${uid}-t`} name="titulo" defaultValue={titulo} required maxLength={60} placeholder="Nombre (ej. Saludo)" className={`${caja} h-10`} />
      <label htmlFor={`${uid}-x`} className="sr-only">
        Texto
      </label>
      <textarea
        id={`${uid}-x`}
        name="texto"
        defaultValue={texto}
        required
        rows={3}
        maxLength={1500}
        placeholder="¡Hola {cliente}! Mi nombre es {vendedora}, de Almacén Yesandy."
        className={caja}
      />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {pendiente ? "Guardando…" : id ? "Guardar" : "Agregar"}
        </button>
        {estado && (
          <span role={estado.ok ? "status" : "alert"} className={`text-xs ${estado.ok ? "text-muted" : "text-danger"}`}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
