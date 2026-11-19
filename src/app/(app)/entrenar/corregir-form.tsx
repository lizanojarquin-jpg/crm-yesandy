"use client";

import { useActionState, useId, useState } from "react";
import { crearLeccion, type Estado } from "./acciones";

const caja = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

/** Formulario "Corregir": lo que debió responder la IA y por qué. */
export function CorregirForm({
  situacion,
  original,
  messageId,
  onCerrar,
}: {
  situacion: string;
  original: string;
  messageId?: string;
  onCerrar?: () => void;
}) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearLeccion, null);
  if (estado?.ok) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">
        <span role="status">{estado.mensaje}</span>
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="text-xs font-medium text-accent">
            Cerrar
          </button>
        )}
      </div>
    );
  }
  return (
    <form action={accion} className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background p-3 text-left">
      <input type="hidden" name="kind" value="correccion" />
      <input type="hidden" name="situation" value={situacion} />
      <input type="hidden" name="original_reply" value={original} />
      {messageId && <input type="hidden" name="message_id" value={messageId} />}
      <label htmlFor={`${id}-c`} className="text-sm font-medium">
        ¿Qué debió responder?
      </label>
      <textarea id={`${id}-c`} name="content" required rows={3} maxLength={2000} className={caja} autoFocus />
      <label htmlFor={`${id}-r`} className="text-xs text-muted">
        Por qué (opcional, ayuda a que aprenda el criterio)
      </label>
      <input id={`${id}-r`} name="reason" maxLength={500} className={`${caja} h-10`} placeholder="Ej. a los clientes de envío hay que pedirles la zona primero" />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar corrección"}
        </button>
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="text-sm text-muted">
            Cancelar
          </button>
        )}
        {estado && !estado.ok && (
          <span role="alert" className="text-xs text-danger">
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}

/** Botón pequeño que abre el formulario debajo de un mensaje de la IA. */
export function BotonCorregir({ situacion, original, messageId }: { situacion: string; original: string; messageId?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-0.5 text-xs font-medium text-accent hover:underline">
        Corregir
      </button>
    );
  }
  return (
    <div className="mt-1 w-full max-w-md">
      <CorregirForm situacion={situacion} original={original} messageId={messageId} onCerrar={() => setAbierto(false)} />
    </div>
  );
}
