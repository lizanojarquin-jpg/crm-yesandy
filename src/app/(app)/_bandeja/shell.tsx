import type { ReactNode } from "react";
import type { Filtros } from "@/lib/inbox/filtros";
import { ListaConversaciones } from "./lista";
import { TiempoReal } from "./tiempo-real";

/**
 * Celular: la lista ocupa la pantalla y la conversación se abre encima.
 * Escritorio: lista a la izquierda y conversación a la derecha.
 */
export function BandejaShell({
  filtros,
  activeId,
  usuarioId,
  ruta,
  children,
}: {
  filtros: Filtros;
  activeId?: string;
  usuarioId: string;
  ruta: string;
  children: ReactNode;
}) {
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[340px_minmax(0,1fr)]">
      <TiempoReal />
      <section className={`${activeId ? "hidden lg:flex" : "flex"} min-h-0 flex-col lg:border-r lg:border-border lg:bg-surface`}>
        <ListaConversaciones filtros={filtros} activeId={activeId} usuarioId={usuarioId} ruta={ruta} />
      </section>
      {children}
    </div>
  );
}
