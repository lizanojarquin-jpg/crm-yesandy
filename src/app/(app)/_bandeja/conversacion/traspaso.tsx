import type { Traspaso } from "@/lib/inbox/queries";
import { horaCorta } from "@/lib/formato";

const CAMPOS: [keyof Traspaso["summary"], string][] = [
  ["para_quien", "Para quién"],
  ["ocasion", "Ocasión"],
  ["fecha", "Para cuándo"],
  ["estilo", "Estilo"],
  ["talla", "Talla"],
  ["prendas", "Le interesa"],
  ["dudas", "Confirmarle"],
];

/** Aviso arriba del chat cuando la IA pasó la conversación y nadie la ha tomado. */
export function AvisoTraspaso({ traspaso }: { traspaso: Traspaso }) {
  const datos = CAMPOS.filter(([k]) => traspaso.summary?.[k]?.trim());
  return (
    <details className="border-b border-border bg-amber-500/10 px-4 py-2 text-sm">
      <summary className="cursor-pointer list-none">
        <span className="font-medium text-amber-900 dark:text-amber-100">La IA pasó esta conversación a vendedora</span>
        <span className="text-xs text-muted"> · {horaCorta(traspaso.created_at)}</span>
        <span className="block text-xs text-amber-900/80 dark:text-amber-100/80">{traspaso.reason}</span>
        {datos.length > 0 && <span className="text-xs font-medium text-accent">Ver resumen</span>}
      </summary>
      {datos.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {datos.map(([k, etiqueta]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{etiqueta}</dt>
              <dd>{traspaso.summary[k]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-1 text-xs text-muted">Se marca como atendida al tomar la conversación o al responder.</p>
    </details>
  );
}
