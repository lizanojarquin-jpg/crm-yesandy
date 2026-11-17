import Link from "next/link";
import type { ReactNode } from "react";

type Tono = "neutro" | "acento" | "aviso";

const tonos: Record<Tono, string> = {
  neutro: "bg-background text-muted border-border",
  acento: "bg-accent/10 text-accent border-accent/20",
  aviso: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300",
};

/** Etiqueta pequeña (etapa, estado). */
export function Chip({ children, tono = "neutro", className = "" }: { children: ReactNode; tono?: Tono; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tonos[tono]} ${className}`}>
      {children}
    </span>
  );
}

/** Filtro que se activa o desactiva con un toque. */
export function ChipEnlace({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={activo ? "true" : undefined}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition ${
        activo ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:bg-background"
      }`}
    >
      {children}
    </Link>
  );
}
