"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/** Mantiene la conversación abajo (en el último mensaje) salvo que la persona esté leyendo más arriba. */
export function Desplazador({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const alFondo = useRef(true);

  const bajar = () => {
    const el = caja.current;
    if (el && alFondo.current) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(bajar);

  useEffect(() => {
    // Las fotos cargan después y cambian la altura.
    const ro = new ResizeObserver(bajar);
    if (contenido.current) ro.observe(contenido.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={caja}
      onScroll={(e) => {
        const el = e.currentTarget;
        alFondo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div ref={contenido} className="mx-auto flex max-w-3xl flex-col gap-1.5 px-3 py-4 md:px-6">
        {children}
      </div>
    </div>
  );
}
