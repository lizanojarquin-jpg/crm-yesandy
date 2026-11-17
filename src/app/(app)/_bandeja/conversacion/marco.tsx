"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Celular: la conversación ocupa toda la pantalla y la ficha se abre como panel lateral.
 * Escritorio grande: la ficha queda fija a la derecha.
 */
export function MarcoConversacion({
  cabecera,
  cuerpo,
  pie,
  ficha,
}: {
  cabecera: ReactNode;
  cuerpo: ReactNode;
  pie: ReactNode;
  ficha: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierta]);

  return (
    <div className="fixed inset-0 z-30 flex bg-background md:static md:z-auto md:h-dvh">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-surface px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:px-4">
          {cabecera}
          <button
            type="button"
            onClick={() => setAbierta(true)}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-sm font-medium xl:hidden"
          >
            Ficha
          </button>
        </header>
        {cuerpo}
        {pie}
      </div>

      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-border bg-surface xl:block">{ficha}</aside>

      {abierta && (
        <div className="fixed inset-0 z-40 flex xl:hidden" role="dialog" aria-modal="true" aria-label="Ficha del contacto">
          <button type="button" aria-label="Cerrar ficha" className="flex-1 bg-black/40" onClick={() => setAbierta(false)} />
          <div className="flex h-full w-[min(380px,92vw)] flex-col overflow-y-auto bg-surface pb-[env(safe-area-inset-bottom)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
              <p className="font-semibold">Ficha del contacto</p>
              <button type="button" onClick={() => setAbierta(false)} className="text-sm font-medium text-accent">
                Listo
              </button>
            </div>
            {ficha}
          </div>
        </div>
      )}
    </div>
  );
}
