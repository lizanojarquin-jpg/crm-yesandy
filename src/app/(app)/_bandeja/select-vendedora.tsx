"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Administración: ver lo de una sola persona del equipo (o lo que nadie tomó).
 * `base` son los demás filtros de la dirección, sin la vendedora.
 */
export function SelectVendedora({
  actual,
  base,
  equipo,
}: {
  actual?: string;
  base: string;
  equipo: { id: string; display_name: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  return (
    <select
      aria-label="Ver las conversaciones de una vendedora"
      value={actual ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(base);
        if (e.target.value) p.set("vendedora", e.target.value);
        const q = p.toString();
        router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false });
      }}
      className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium outline-none ${
        actual ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground"
      }`}
    >
      <option value="">Todo el equipo</option>
      <option value="libres">Sin tomar</option>
      {equipo.map((p) => (
        <option key={p.id} value={p.id}>
          {p.display_name}
        </option>
      ))}
    </select>
  );
}
