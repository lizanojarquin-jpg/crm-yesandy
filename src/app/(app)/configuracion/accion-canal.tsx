"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { activarWebhook, importarHistorial, sincronizarCanales, type Estado } from "./canales-actions";

const ACCIONES = { sincronizar: sincronizarCanales, importar: importarHistorial, webhook: activarWebhook };

export function AccionCanal({ accion, texto }: { accion: keyof typeof ACCIONES; texto: string }) {
  const [estado, ejecutar, pendiente] = useActionState<Estado>(ACCIONES[accion], null);
  return (
    <form action={ejecutar} className="flex flex-col gap-1">
      <Button type="submit" variante="secundario" disabled={pendiente}>
        {pendiente ? "Trabajando…" : texto}
      </Button>
      {estado && <p className={`max-w-xs text-xs ${estado.ok ? "text-muted" : "text-danger"}`}>{estado.mensaje}</p>}
    </form>
  );
}
