"use client";

import { useActionState } from "react";
import { confirmarNombre, type Estado } from "./acciones";

export function FormularioNombre({ actual, siguiente }: { actual: string; siguiente: string }) {
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(confirmarNombre, null);
  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="siguiente" value={siguiente} />
      <label htmlFor="nombre" className="text-sm font-medium">
        ¿Con qué nombre te presentas a los clientes hoy?
      </label>
      <input
        id="nombre"
        name="nombre"
        required
        minLength={2}
        maxLength={40}
        defaultValue={actual}
        autoComplete="given-name"
        autoFocus
        placeholder="Ej. Hellen"
        className="h-12 rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent"
      />
      <p className="text-xs text-muted">
        Se usa en las respuestas rápidas, por ejemplo: “Hola, mi nombre es {actual || "Hellen"}, de Almacén Yesandy”. El equipo te ve como tu
        usuario y este nombre.
      </p>
      <button
        disabled={pendiente}
        className="h-12 rounded-lg bg-accent text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Entrar"}
      </button>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-danger">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
