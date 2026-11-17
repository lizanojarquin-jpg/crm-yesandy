"use client";

import { usePathname, useRouter } from "next/navigation";
import { ETAPAS, type Etapa } from "@/lib/inbox/etiquetas";

/** Filtro por etapa. `base` son los demás filtros, sin la etapa. */
export function SelectEtapa({ actual, base }: { actual?: Etapa; base: string }) {
  const router = useRouter();
  const ruta = usePathname();
  return (
    <select
      aria-label="Filtrar por etapa"
      value={actual ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(base);
        if (e.target.value) p.set("etapa", e.target.value);
        const q = p.toString();
        router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false });
      }}
      className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium outline-none ${
        actual ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground"
      }`}
    >
      <option value="">Todas las etapas</option>
      {ETAPAS.map((e) => (
        <option key={e.valor} value={e.valor}>
          {e.texto}
        </option>
      ))}
    </select>
  );
}
