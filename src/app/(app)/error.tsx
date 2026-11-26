"use client";

import { useEffect } from "react";
import { reportarFalla } from "@/lib/diagnostico-cliente";

/** Si una pantalla falla, se guarda el detalle para administración y se puede reintentar sin perder la sesión. */
export default function ErrorPantalla({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const pila = error instanceof Error ? (error.stack ?? "").split("\n").slice(0, 4).join(" | ") : "";
    reportarFalla("pantalla con error", error, `${location.pathname} · ${pila}`.slice(0, 900));
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-lg font-semibold">Algo falló en esta pantalla</p>
      <p className="text-sm text-muted">
        Ya le llegó el detalle a administración. Lo que ya se envió quedó enviado; revisa el chat antes de mandarlo otra vez.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground">
          Reintentar
        </button>
        <button type="button" onClick={() => location.reload()} className="h-10 rounded-lg border border-border px-4 text-sm">
          Recargar
        </button>
      </div>
    </div>
  );
}
