import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "fantasma";

const estilos: Record<Variante, string> = {
  primario: "bg-accent text-accent-foreground hover:opacity-90",
  secundario: "bg-surface text-foreground border border-border hover:bg-background",
  fantasma: "text-muted hover:text-foreground hover:bg-background",
};

export function Button({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${estilos[variante]} ${className}`}
      {...props}
    />
  );
}
