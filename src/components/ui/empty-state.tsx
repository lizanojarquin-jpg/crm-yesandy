import type { ReactNode } from "react";

export function EmptyState({
  titulo,
  descripcion,
  icono,
}: {
  titulo: string;
  descripcion: string;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icono && <div className="mb-2 text-muted">{icono}</div>}
      <p className="font-medium">{titulo}</p>
      <p className="max-w-xs text-sm text-muted">{descripcion}</p>
    </div>
  );
}
