"use client";

import { useActionState, useId } from "react";
import { guardarConocimiento, type EstadoIA } from "./ia-actions";

export function ConocimientoForm({ clave, titulo, contenido }: { clave: string; titulo: string; contenido: string }) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<EstadoIA, FormData>(guardarConocimiento.bind(null, clave), null);
  return (
    <form action={accion} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{titulo}</label>
      <textarea
        id={id}
        name="contenido"
        rows={3}
        maxLength={2000}
        defaultValue={contenido}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className="text-sm font-medium text-accent disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {estado && (
          <span role="status" className={`text-xs ${estado.ok ? "text-muted" : "text-danger"}`}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
