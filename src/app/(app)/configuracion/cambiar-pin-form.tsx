"use client";

import { useActionState } from "react";
import { cambiarPin, type EstadoPin } from "./actions";
import { Button } from "@/components/ui/button";

export function CambiarPinForm({ userId }: { userId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoPin, FormData>(
    cambiarPin.bind(null, userId),
    null,
  );

  return (
    <form action={accion} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="Nuevo PIN"
          aria-label="Nuevo PIN de 6 números"
          autoComplete="new-password"
          className="h-11 w-32 rounded-lg border border-border bg-surface px-3 text-base tracking-widest outline-none focus:border-accent"
          required
        />
        <Button type="submit" variante="secundario" disabled={pendiente}>
          {pendiente ? "…" : "Cambiar"}
        </Button>
      </div>
      {estado && (
        <p className={`text-xs ${estado.ok ? "text-muted" : "text-danger"}`}>{estado.mensaje}</p>
      )}
    </form>
  );
}
